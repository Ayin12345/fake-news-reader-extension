import { fetchOpenAI, fetchGemini } from '../services/aiHandling.js';
import { processAnalysisResults } from '../services/analysisProcessor.js';
import { analysisCache, generateCacheKey } from '../services/redisCache.js';
import { createConfigurationError, createTimeoutError, createProcessingError, ErrorCode } from '../utils/errors.js';

export async function analyzeRoute(req, res) {
  try {
    const { prompt, providers, requestId, supportingLinks } = req.body;

    // Generate cache key from request data
    const cacheKey = generateCacheKey('analyze', {
      prompt: prompt.substring(0, 1000), // Use first 1000 chars for cache key
      providers: providers.sort().join(','),
      supportingLinks: supportingLinks?.sort().join(',') || ''
    });

    // Check cache first
    const cachedResult = await analysisCache.get(cacheKey);
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult.data,
        requestId,
        cached: true
      });
    }

    // Get API keys from environment
    const openAIKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Validate API keys before processing
    const missingKeys = [];
    if (providers.includes('OpenAI') && !openAIKey) {
      missingKeys.push('OpenAI');
    }
    if (providers.includes('Gemini') && !geminiKey) {
      missingKeys.push('Gemini');
    }
    
    if (missingKeys.length > 0) {
      throw createConfigurationError(
        ErrorCode.MISSING_API_KEY,
        `API keys not configured for providers: ${missingKeys.join(', ')}`,
        { missingKeys, requestedProviders: providers }
      );
    }

    // Create promises for each provider
    const providerPromises = providers.map(async (provider) => {
      try {
        let result;
        switch (provider) {
          case 'OpenAI':
            result = await fetchOpenAI(prompt, openAIKey);
            break;
          case 'Gemini':
            result = await fetchGemini(prompt, geminiKey);
            break;
          default:
            throw createProcessingError(
              ErrorCode.UNKNOWN_ERROR,
              `Unknown provider: ${provider}`,
              { provider, validProviders: ['OpenAI', 'Gemini'] }
            );
        }
        return result;
      } catch (error) {
        console.error(`[Backend Analyze] Error in provider ${provider}:`, error);
        throw error;
      }
    });

    // Execute all providers in parallel with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(createTimeoutError(
          ErrorCode.PROCESSING_TIMEOUT,
          'Analysis timeout after 60 seconds',
          { timeoutMs: 60000, providers }
        ));
      }, 60000);
    });

    let results;
    try {
      results = await Promise.race([
        Promise.allSettled(providerPromises),
        timeoutPromise
      ]);
    } catch (timeoutError) {
      // Timeout occurred - return failed results for all providers
      const timeoutErrorObj = timeoutError instanceof Error 
        ? timeoutError 
        : createTimeoutError(ErrorCode.PROCESSING_TIMEOUT, 'Request timeout after 60 seconds', { providers });
      
      results = providerPromises.map(() => ({
        status: 'rejected',
        reason: timeoutErrorObj
      }));
    }

    // Process results
    const { successfulResults, failedProviders } = processAnalysisResults(results, providers);

    // Merge web search links into results if they weren't included by AI
    // Extract supporting links from prompt if they exist
    const promptLinksMatch = prompt.match(/"supporting_links":\s*\[(.*?)\]/);
    let webSearchLinks = [];
    if (supportingLinks && Array.isArray(supportingLinks)) {
      webSearchLinks = supportingLinks;
    } else if (promptLinksMatch) {
      try {
        const linksStr = promptLinksMatch[1];
        if (linksStr.trim()) {
          webSearchLinks = linksStr.split(',').map(link => 
            link.trim().replace(/^"|"$/g, '').trim()
          ).filter(Boolean);
        }
      } catch (e) {
        console.warn('Failed to extract links from prompt:', e);
      }
    }

    // If we have web search links and AI didn't include them, merge them in
    if (webSearchLinks.length > 0) {
      successfulResults.forEach((result) => {
        if (!result.result.supporting_links || result.result.supporting_links.length === 0) {
          result.result.supporting_links = [...webSearchLinks];
        } else {
          // Merge unique links
          const existing = new Set(result.result.supporting_links);
          webSearchLinks.forEach(link => existing.add(link));
          result.result.supporting_links = Array.from(existing);
        }
      });
    }

    // Prepare response
    const response = {
      success: true,
      data: {
        successfulResults,
        failedProviders
      },
      requestId
    };

    // Cache successful results (7 days TTL)
    if (successfulResults.length > 0) {
      await analysisCache.set(cacheKey, response, 7 * 24 * 60 * 60 * 1000);
    }

    // Return response
    res.json(response);
  } catch (error) {
    // Error will be handled by error middleware
    // Re-throw to let middleware handle it
    throw error;
  }
}

