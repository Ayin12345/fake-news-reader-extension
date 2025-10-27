// Analysis processing and JSON parsing utilities

export function cleanAndParseJSON(text: string) {
  try {
    // First try direct JSON parse
    return JSON.parse(text);
  } catch (e) {
    // If that fails, try to clean and extract JSON
    try {
      // Remove any leading/trailing non-JSON content
      let jsonStr = text.trim();
      
      // Find the first { and last }
      const startIdx = jsonStr.indexOf('{');
      const endIdx = jsonStr.lastIndexOf('}') + 1;
      if (startIdx >= 0 && endIdx > startIdx) {
        jsonStr = jsonStr.slice(startIdx, endIdx);
      }

      // Clean up common formatting issues
      jsonStr = jsonStr
        .replace(/\\n/g, ' ')           // Replace \n with space
        .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
        .replace(/"\s*,\s*}/g, '"}')    // Remove trailing commas
        .replace(/,(\s*})/g, '$1')      // Remove trailing commas in objects
        .replace(/\.,/g, '.')           // Fix ".," issues
        .replace(/\."/g, '"')           // Fix trailing periods in strings
        .replace(/"\s*\.\s*$/g, '"')    // Fix trailing periods after quotes
        .replace(/\[\s*,/g, '[')        // Fix leading commas in arrays
        .replace(/,\s*\]/g, ']');       // Fix trailing commas in arrays

      const parsed = JSON.parse(jsonStr);

      // Clean up the parsed object
      if (parsed.credibility_summary) {
        parsed.credibility_summary = parsed.credibility_summary
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\.,/g, '.')
          .replace(/\.+$/, '.');
      }

      if (parsed.reasoning) {
        parsed.reasoning = parsed.reasoning
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\.,/g, '.')
          .replace(/\.+$/, '.');
      }

      if (Array.isArray(parsed.evidence_sentences)) {
        parsed.evidence_sentences = parsed.evidence_sentences.map((evidence: any) => ({
          quote: evidence.quote?.trim().replace(/\s+/g, ' ').replace(/\.+$/, '') || '',
          impact: evidence.impact?.trim().replace(/\s+/g, ' ').replace(/\.+$/, '') || ''
        })).filter((e: any) => e.quote && e.impact);
      }

      if (Array.isArray(parsed.supporting_links)) {
        parsed.supporting_links = parsed.supporting_links
          .map((link: string) => link.trim())
          .filter(Boolean);
      }

      // Ensure credibility_score is a number between 1-100
      if (typeof parsed.credibility_score === 'string') {
        parsed.credibility_score = parseInt(parsed.credibility_score, 10);
      }
      parsed.credibility_score = Math.max(1, Math.min(100, parsed.credibility_score || 0));

      return parsed;
    } catch (e2) {
      console.error('Failed to parse cleaned JSON:', e2);
      throw new Error('Invalid JSON format');
    }
  }
}

export interface AnalysisResult {
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
}

export function processAnalysisResults(
  results: PromiseSettledResult<any>[],
  providers: string[]
): { successfulResults: AnalysisResult[]; failedProviders: string[] } {
  const successfulResults = results
    .map((r, i) => {
      if (r.status === 'fulfilled') {
        try {
          let parsedResult;
          if (typeof r.value === 'string') {
            try {
              parsedResult = cleanAndParseJSON(r.value);
            } catch (e) {
              console.error('Failed to parse result:', e);
              return null;
            }
          } else {
            parsedResult = r.value;
          }

          if (!parsedResult) {
            console.error('No parsed result available');
            return null;
          }

          // Validate the structure
          if (typeof parsedResult.credibility_score !== 'number' ||
              typeof parsedResult.credibility_summary !== 'string' ||
              typeof parsedResult.reasoning !== 'string' ||
              !Array.isArray(parsedResult.evidence_sentences) ||
              !Array.isArray(parsedResult.supporting_links)) {
            console.error('Invalid result structure:', parsedResult);
            return null;
          }

          return {
            provider: providers[i],
            result: parsedResult
          };
        } catch (e) {
          console.error(`Error processing result from provider ${providers[i]}:`, e);
          return null;
        }
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const failedProviders = results
    .map((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Provider ${providers[i]} failed:`, r.reason);
        return providers[i];
      }
      return null;
    })
    .filter((x): x is string => x !== null);

  return { successfulResults, failedProviders };
}
