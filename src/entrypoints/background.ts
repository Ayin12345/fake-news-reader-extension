import { fetchOpenAI } from '../utils/aiHandling'
import { fetchGemini } from '../utils/aiHandling'
import { fetchCohere } from '../utils/aiHandling'
import { fetchMistral7B } from '../utils/aiHandling'
import { fetchMixtral8x7B } from '../utils/aiHandling'
import { fetchLlama } from '../utils/aiHandling'
import { defineBackground } from 'wxt/utils/define-background'

// Add web search function
async function performWebSearch(query: string, maxResults: number = 5) {
  try {
    console.log('=== WEB SEARCH DEBUG START ===');
    console.log('Original query received:', query);
    console.log('Max results requested:', maxResults);
    
    // Check if API keys are present
    console.log('Google API Key present:', !!import.meta.env.VITE_GOOGLE_API_KEY);
    console.log('Google Search Engine ID present:', !!import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID);
    
    // Extract domain from URL if present and create targeted search
    let domain = '';
    try {
      const urlMatch = query.match(/https?:\/\/([^\/]+)/);
      if (urlMatch) {
        domain = urlMatch[1].replace('www.', '');
      }
    } catch (e) {
      console.log('Could not extract domain from query');
    }
    
    // Create search query - use broader search to find similar articles
    const searchTerms = query.replace(/https?:\/\/[^\s]+/g, '').trim(); // Remove URLs from search terms
    
    // Extract domain from the current page URL to exclude it
    let currentDomain = '';
    try {
      const urlMatch = query.match(/https?:\/\/([^\/]+)/);
      if (urlMatch) {
        currentDomain = urlMatch[1].replace('www.', '');
      }
    } catch (e) {
      console.log('Could not extract current domain from query');
    }
    
    // Create a broader search query without quotes to find similar articles
    const enhancedQuery = currentDomain ? 
      `${searchTerms} -site:${currentDomain}` :
      searchTerms;
    
    console.log('Enhanced search query:', enhancedQuery);
    console.log('Encoded query:', encodeURIComponent(enhancedQuery));
    
    const searchUrl = `https://www.googleapis.com/customsearch/v1?` + 
      `key=${import.meta.env.VITE_GOOGLE_API_KEY}` +
      `&cx=${import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID}` +
      `&q=${encodeURIComponent(enhancedQuery)}` +
      `&num=${maxResults}` +
      '&fields=items(title,snippet,link)';
    
    console.log('Full search URL (without API key):', searchUrl.replace(import.meta.env.VITE_GOOGLE_API_KEY, 'API_KEY_HIDDEN'));
    
    const response = await fetch(searchUrl);

    console.log('Search response status:', response.status, response.statusText);
    console.log('Search response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Search API error response:', errorText);
      throw new Error(`Search API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Raw search API response:', data);
    console.log('Number of results returned:', data.items?.length || 0);
    
    if (data.items && data.items.length > 0) {
      console.log('Detailed search results:');
      data.items.forEach((result: any, index: number) => {
        console.log(`Result ${index + 1}:`);
        console.log(`  Title: ${result.title}`);
        console.log(`  URL: ${result.link}`);
        console.log(`  Snippet: ${result.snippet?.substring(0, 100)}...`);
      });
    } else {
      console.log('No search results found');
    }
    
    const processedResults = data.items
      ?.filter((result: any) => {
        // Filter out results that are too similar to the original article
        const resultUrl = result.link.toLowerCase();
        const resultTitle = result.title.toLowerCase();
        
        // Check if this result is from the same domain as the original article
        if (currentDomain && resultUrl.includes(currentDomain)) {
          console.log(`Filtering out result from same domain: ${result.link}`);
          return false;
        }
        
        // Check if the title is too similar (likely the same article)
        const originalTitleWords = searchTerms.toLowerCase().split(' ').filter(word => word.length > 3);
        const titleSimilarity = originalTitleWords.filter(word => resultTitle.includes(word)).length;
        if (titleSimilarity > originalTitleWords.length * 0.7) {
          console.log(`Filtering out too similar title: ${result.title}`);
          return false;
        }
        
        return true;
      })
      .map((result: any) => ({
        url: result.link,
        title: result.title,
        snippet: result.snippet
      })) || [];
    
    console.log('Processed results being returned:', processedResults);
    console.log('=== WEB SEARCH DEBUG END ===');
    
    return processedResults;
  } catch (error) {
    console.error('Web search failed:', error);
    return [];
  }
}

interface TabState {
  pageInfo: {
    title: string;
    content: string;
    url: string;
    wordCount: number;
  } | null;
  analysis: Array<{
    provider: string;
    result: {
      credibility_score: number;
      credibility_summary: string;
      reasoning: string;
      evidence_sentences: Array<{
        quote: string;
        impact: string;
      }>;
      supporting_links: string[];
    };
  }>;
  failedProviders: string[];
  showButton: boolean;
  isAnalyzing: boolean; // Track analyzing state per tab
}

// Store states for all tabs
const tabStates = new Map<number, TabState>();

// Get default state for a new tab
const getDefaultState = (): TabState => ({
  pageInfo: null,
  analysis: [],
  failedProviders: [],
  showButton: true,
  isAnalyzing: false
});

export default defineBackground({
  main() {
    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Extension installed')
    })

    // Handle extension icon clicks to open side panel
    chrome.action.onClicked.addListener(() => {
      chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    });

    // Listen for tab removal to clean up state
    chrome.tabs.onRemoved.addListener((tabId) => {
      tabStates.delete(tabId);
    });

    // Listen for tab activation to handle state management when switching tabs
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        console.log('Tab switched to:', activeInfo.tabId);
        
        // Get the state for the newly activated tab
        const newTabState = tabStates.get(activeInfo.tabId);
        
        // Debug: Log the state being sent
        if (newTabState && newTabState.analysis) {
          console.log('Tab switch - Analysis state:', newTabState.analysis);
          console.log('Analysis length:', newTabState.analysis.length);
          newTabState.analysis.forEach((result: any, idx: number) => {
            console.log(`Tab switch - Analysis ${idx}:`, result.provider, result.result.credibility_summary);
          });
        }
        
        // Send a message to the sidebar to update its state
        // This will trigger the sidebar to reload with the correct state for this tab
        chrome.runtime.sendMessage({
          type: 'TAB_SWITCHED',
          tabId: activeInfo.tabId,
          state: newTabState || getDefaultState()
        }).catch(error => {
          // Ignore errors if sidebar is not open
          console.log('Sidebar not open or not ready:', error);
        });
        
      } catch (error) {
        console.log('Error handling tab switch:', error);
      }
    });

    // Message handler
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_PAGE_INFO') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab found' });
              return;
            }

            const pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT'})
            if (pageInfo && pageInfo.error) {
              sendResponse({ success: false, error: pageInfo.error })
              return
            }

            // Get or create state for this tab
            let state = tabStates.get(tab.id) || getDefaultState();
            
            // Update state with new page info, but preserve existing analysis if page is the same
            const isSamePage = state.pageInfo?.url === pageInfo.data.url;
            
            state = {
              ...state,
              pageInfo: pageInfo.data,
              showButton: true,
              // Only clear analysis if it's a different page
              analysis: isSamePage ? state.analysis : [],
              failedProviders: isSamePage ? state.failedProviders : []
            };
            
            // Save state
            tabStates.set(tab.id, state);

            sendResponse({ success: true, data: pageInfo.data })
          } catch (error) {
            sendResponse({ success: false, error: 'Failed to fetch page info' })
          }
        })()
        return true;
      } 
      
      if (message.type === 'ANALYZE_ARTICLE') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab found' });
              return;
            }

            const providers = message.providers || []
            
            // Set analyzing state for this tab
            let currentState = tabStates.get(tab.id) || getDefaultState();
            currentState.isAnalyzing = true;
            tabStates.set(tab.id, currentState);
            
            // Debug: Log the providers array
            console.log('Providers array received:', providers);
            console.log('Providers array length:', providers.length);
            
            // Debug: Log API keys (without exposing full keys)
            console.log('API Keys Debug:');
            console.log('Cohere key length:', import.meta.env.VITE_COHERE_API_KEY?.length || 0);
            console.log('Cohere key starts with:', import.meta.env.VITE_COHERE_API_KEY?.substring(0, 5) || 'none');
            console.log('Gemini key length:', import.meta.env.VITE_GEMINI_API_KEY?.length || 0);
            console.log('HuggingFace key length:', import.meta.env.VITE_HUGGINGFACE_API_KEY?.length || 0);
            console.log('HuggingFace key starts with:', import.meta.env.VITE_HUGGINGFACE_API_KEY?.substring(0, 5) || 'none');
            
            const results = await Promise.allSettled(
              providers.map(async (provider: string) => {
                console.log(`Trying provider: ${provider}`);
                try {
                  switch (provider) {
                  case 'OpenAI':
                    return await fetchOpenAI(message.content, import.meta.env.VITE_OPENAI_API_KEY || '')
                  case 'Gemini':
                    return await fetchGemini(message.content, import.meta.env.VITE_GEMINI_API_KEY || '')
                  case 'Cohere':
                    return await fetchCohere(message.content, import.meta.env.VITE_COHERE_API_KEY || '')
                  case 'Mistral7B':
                    return await fetchMistral7B(message.content, import.meta.env.VITE_HUGGINGFACE_API_KEY || '')
                  case 'Mixtral8x7B':
                    return await fetchMixtral8x7B(message.content, import.meta.env.VITE_HUGGINGFACE_API_KEY || '')
                  case 'Llama':
                    return await fetchLlama(message.content, import.meta.env.VITE_HUGGINGFACE_API_KEY || '')
                  default:
                    throw new Error(`Unknown provider: ${provider}`)
                }
                } catch (error) {
                  console.error(`Error in provider ${provider}:`, error);
                  throw error;
                }
              })
            )

            // Process results
            const successfulResults = results
              .map((r, i) => {
                if (r.status === 'fulfilled') {
                  try {
                    let parsedResult;
                    if (typeof r.value === 'string') {
                      try {
                        parsedResult = JSON.parse(r.value);
                      } catch (e) {
                        const scoreMatch = r.value.match(/credibility_score["\s:]+(\d+)/);
                        const summaryMatch = r.value.match(/credibility_summary["\s:]+(.+?)(?=reasoning|supporting_links|evidence_sentences|$)/s);
                        const reasoningMatch = r.value.match(/reasoning["\s:]+(.+?)(?=supporting_links|evidence_sentences|$)/s);
                        const evidenceMatch = r.value.match(/evidence_sentences["\s:]+\[(.*?)\]/s);
                        const linksMatch = r.value.match(/supporting_links["\s:]+\[(.*?)\]/s);
                        
                        // Parse evidence sentences with their impact
                        let evidenceSentences: Array<{ quote: string; impact: string }> = [];
                        if (evidenceMatch) {
                          const evidenceContent = evidenceMatch[1];
                          // Match each evidence object in the array
                          const evidenceObjects = evidenceContent.match(/\{[^{}]*\}/g) || [];
                          evidenceSentences = evidenceObjects.map((obj: string) => {
                            try {
                              const parsed = JSON.parse(obj);
                              return {
                                quote: parsed.quote?.trim().replace(/['"]+/g, '') || '',
                                impact: parsed.impact?.trim().replace(/['"]+/g, '') || ''
                              };
                            } catch (e: unknown) {
                              // Fallback for simpler format
                              const quoteMatch = obj.match(/quote["\s:]+([^,}]+)/);
                              const impactMatch = obj.match(/impact["\s:]+([^,}]+)/);
                              return {
                                quote: quoteMatch ? quoteMatch[1].trim().replace(/['"]+/g, '') : '',
                                impact: impactMatch ? impactMatch[1].trim().replace(/['"]+/g, '') : ''
                              };
                            }
                          }).filter((e: { quote: string; impact: string }) => e.quote && e.impact);
                        }
                        
                        parsedResult = {
                          credibility_score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                          credibility_summary: summaryMatch ? summaryMatch[1].trim().replace(/['"]+/g, '').replace(/[.,]+$/, '') : 'No summary provided',
                          reasoning: reasoningMatch ? reasoningMatch[1].trim().replace(/['"]+/g, '').replace(/[.,]+$/, '') : r.value,
                          evidence_sentences: evidenceSentences,
                          supporting_links: linksMatch ? 
                            linksMatch[1].split(',')
                              .map((link: string) => link.trim().replace(/['"]+/g, ''))
                              .filter((link: string) => link.length > 0) : []
                        };
                      }
                    } else {
                      parsedResult = r.value;
                    }

                    if (!parsedResult) return null;

                    return {
                      provider: providers[i],
                      result: parsedResult
                    };
                  } catch (e) {
                    return null;
                  }
                }
                return null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            const failedProviders = results
              .map((r, i) => {
                console.log(`Provider ${providers[i]} status:`, r.status);
                if (r.status === 'rejected') {
                  console.error(`Provider ${providers[i]} failed:`, r.reason);
                  return providers[i];
                } else if (r.status === 'fulfilled') {
                  console.log(`Provider ${providers[i]} succeeded`);
                }
                return null;
              })
              .filter((x): x is string => x !== null);

            // Update tab state with analysis results
            let state = tabStates.get(tab.id);
            if (!state) {
              // If no state exists, create default but we need to preserve pageInfo
              // This shouldn't happen in normal flow, but let's handle it
              console.warn('No existing tab state found during analysis');
              state = getDefaultState();
            }
            
            state.analysis = successfulResults;
            state.failedProviders = failedProviders;
            state.showButton = false;
            state.isAnalyzing = false; // Analysis is complete
            
            // Debug: Log the analysis being saved
            console.log('Saving analysis state:', successfulResults);
            console.log('Analysis length:', successfulResults.length);
            successfulResults.forEach((result: any, idx: number) => {
              console.log(`Saving - Analysis ${idx}:`, result.provider, result.result.credibility_summary);
            });
            
            tabStates.set(tab.id, state);
            
            sendResponse({
              success: true,
              data: results,
              providers: providers
            })
          } catch (error) {
            sendResponse({ success: false, error: 'Failed to analyze article' })
          }
        })()
        return true;
      }

      if (message.type === 'GET_TAB_STATE') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab found' });
              return;
            }

            // Get or create state for this tab
            const state = tabStates.get(tab.id) || getDefaultState();
            sendResponse({ success: true, data: state });
          } catch (error) {
            sendResponse({ success: false, error: 'Failed to get tab state' });
          }
        })()
        return true;
      }

      if (message.type === 'RESET_TAB_STATE') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab found' });
              return;
            }

            // Reset state for this tab only
            tabStates.set(tab.id, getDefaultState());
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: 'Failed to reset tab state' });
          }
        })()
        return true;
      }

      if (message.type === 'SAVE_TAB_STATE') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab found' });
              return;
            }

            // Save the provided state for this tab
            tabStates.set(tab.id, {
              pageInfo: message.data.pageInfo,
              analysis: message.data.analysis,
              failedProviders: message.data.failedProviders,
              showButton: message.data.showButton,
              isAnalyzing: message.data.isAnalyzing || false
            });
            
            sendResponse({ success: true });
          } catch (error) {
            sendResponse({ success: false, error: 'Failed to save tab state' });
          }
        })()
        return true;
      }

      if (message.type === 'WEB_SEARCH') {
        (async () => {
          try {
            const results = await performWebSearch(message.query, message.max_results);
            sendResponse({ 
              success: true, 
              data: { results } 
            });
          } catch (error) {
            console.error('Web search error:', error);
            sendResponse({ 
              success: false, 
              error: 'Failed to perform web search' 
            });
          }
        })();
        return true;
      }

      if (message.type === 'TAB_SWITCHED') {
        // This message is sent from the background script to the sidebar
        // No response needed as it's a one-way notification
        return true;
      }

      return true;
    })
  }
});