import React, { useState, useEffect } from 'react';
import { PageDetails } from './components/PageDetails';
import { AnalysisResults } from './components/AnalysisResults';
import { FailedProviders } from './components/FailedProviders';
import styles from './styles/App.module.css';

function App() {
  type PageInfo = {
    title: string,
    content: string,
    url: string,
    wordCount: number
  }

  interface AnalysisResult {
    provider: string,
    result: {
      credibility_score: number;
      credibility_summary: string;
      reasoning: string;
      evidence_sentences: Array<{
        quote: string;
        impact: string;
      }>;
      supporting_links: string[];
    }
  }

  // Add loading state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDetectingPage, setIsDetectingPage] = useState(false);
  const [error, setError] = useState('');
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [failedProviders, setFailedProviders] = useState<string[]>([]);
  const [showButton, setShowButton] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [hasAttemptedAnalysis, setHasAttemptedAnalysis] = useState(false); // Track if user has tried to analyze
  const [currentStep, setCurrentStep] = useState(0);
  const [providerStatuses, setProviderStatuses] = useState<{[key: string]: 'waiting' | 'analyzing' | 'complete' | 'failed'}>({});

  // Load saved state when popup opens and handle tab switches
  useEffect(() => {
    const loadTabState = () => {
      chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' }, (response) => {
        if (response?.success && response.data) {
          const state = response.data;
          if (state.pageInfo) setPageInfo(state.pageInfo);
          if (state.analysis) setAnalysis(state.analysis);
          if (state.failedProviders) setFailedProviders(state.failedProviders);
          if (typeof state.showButton === 'boolean') setShowButton(state.showButton);
          // Mark as attempted if we have analysis results OR page info (user has started the process)
          if ((state.analysis && state.analysis.length > 0) || state.pageInfo) {
            setHasAttemptedAnalysis(true);
          }
        }
      });
    };

    // Load initial state
    loadTabState();

    // Listen for messages from background script
    const handleMessages = (message: any) => {
      if (message.type === 'TAB_SWITCHED') {
        console.log('Tab switched, updating state:', message.state);
        
        // Update state based on the new tab's state
        const state = message.state;
        
        // Clear current state first
        setError('');
        setPageInfo(null);
        setAnalysis([]);
        setFailedProviders([]);
        setShowButton(true);
        setHasAttemptedAnalysis(false);
        setIsAnalyzing(false); // Reset analyzing state when switching tabs
        setIsDetectingPage(false);
        
        // Set new state if it exists
        if (state) {
          if (state.pageInfo) setPageInfo(state.pageInfo);
          if (state.analysis) {
            console.log('Restoring analysis state:', state.analysis);
            console.log('Analysis length:', state.analysis.length);
            state.analysis.forEach((result: any, idx: number) => {
              console.log(`Analysis ${idx}:`, result.provider, result.result.credibility_summary);
            });
            setAnalysis(state.analysis);
          }
          if (state.failedProviders) setFailedProviders(state.failedProviders);
          if (typeof state.showButton === 'boolean') setShowButton(state.showButton);
          if (typeof state.isAnalyzing === 'boolean') setIsAnalyzing(state.isAnalyzing);
          
          // Determine if user has attempted analysis for this tab
          if ((state.analysis && state.analysis.length > 0) || state.pageInfo) {
            setHasAttemptedAnalysis(true);
          }
        }
        
      }
      
      // Handle real-time provider updates
      if (message.type === 'PROVIDER_UPDATE') {
        console.log(`Provider update: ${message.provider} -> ${message.status}`);
        setProviderStatuses(prev => ({
          ...prev,
          [message.provider]: message.status
        }));
      }
    };

    // Add message listener
    chrome.runtime.onMessage.addListener(handleMessages);

    // Cleanup listener on unmount
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages);
    };
  }, []);

  const resetState = () => {
    setError('');
    setPageInfo(null);
    setAnalysis([]);
    setFailedProviders([]);
    setShowButton(true);
    setHasAttemptedAnalysis(false);
    setCurrentStep(0);
    setProviderStatuses({});
    setIsDetectingPage(false);
  };

  // Typewriter effect steps
  const analysisSteps = [
    "Extracting article content...",
    "Analyzing credibility patterns...",
    "Cross-referencing sources...",
    "Extracting supporting quotes...",
    "Verifying information...",
    "Querying AI providers...",
    "Processing responses...",
    "Generating insights...",
    "Finalizing results..."
  ];

  // Cycle through analysis steps during loading
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % analysisSteps.length);
      }, 2000); // Change step every 2 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAnalyzing]);

  const getPageInfo = () => {
    // Reset state
    setError('');
    setPageInfo(null);
    setAnalysis([]);
    setFailedProviders([]);
    setShowButton(true);
    setHasAttemptedAnalysis(true); // Mark that user has attempted analysis
    setIsDetectingPage(true); // Show detecting state

    // Reset background state
    chrome.runtime.sendMessage({ type: 'RESET_TAB_STATE' }, (response) => {
      if (!response?.success) {
        setError('Failed to reset state');
        return;
      }

      // Get new page info
      chrome.runtime.sendMessage({ type: 'GET_PAGE_INFO' }, (response) => {
        setIsDetectingPage(false); // Hide detecting state
        
        if (!response.success) {
          setError(response.error || 'Failed to get page info');
          return;
        }
        
        if (!response.data) {
          setError('No page data received');
          return;
        }

        setPageInfo({
          title: response.data.title || 'No title found',
          content: response.data.content || 'No content found',
          url: response.data.url || 'No URL found',
          wordCount: response.data.wordCount || 0
        });
      });
    });
  }

  const analyzeArticle = () => {
    if (!pageInfo) {
      setError('No page info found')
      return
    }
    
    setError('')
    setAnalysis([])
    setFailedProviders([])
    setSelectedProvider('')
    
    // Initialize provider statuses
    let providers;
    try {
      providers = JSON.parse(import.meta.env.VITE_AI_ROUTERS || '["Cohere", "Gemini", "Llama", "Mistral7B", "Mixtral8x7B"]');
    } catch (error) {
      console.warn('Failed to parse VITE_AI_ROUTERS, using fallback:', error);
      providers = ["Cohere", "Gemini", "Llama", "Mistral7B", "Mixtral8x7B"];
    }
    const initialStatuses: {[key: string]: 'waiting' | 'analyzing' | 'complete' | 'failed'} = {};
    providers.forEach((provider: string) => {
      initialStatuses[provider] = 'analyzing';
    });
    setProviderStatuses(initialStatuses);
    
    setIsAnalyzing(true)
    


    chrome.runtime.sendMessage({
      type: 'ANALYZE_ARTICLE',
      content: 
      `Analyze this news article for credibility and provide a structured response in JSON format:

        {
          "credibility_score": (1-100),
          "credibility_summary": "2-3 sentence balanced assessment showing both credibility strengths and concerns",
          "reasoning": "detailed explanation of the credibility score with specific evidence and analysis",
          "evidence_sentences": [
            {
              "quote": "exact quote from the article",
              "impact": "how this specific quote supports or undermines credibility"
            }
          ],
          "supporting_links": []
        }

        ARTICLE TO ANALYZE:
        URL: ${pageInfo.url}
        TITLE: ${pageInfo.title}
        CONTENT: ${pageInfo.content}

        ANALYSIS REQUIREMENTS:
        1. credibility_score: Must be a number between 1-100
        2. credibility_summary: Must be 2 sentences showing both strengths and concerns
        3. reasoning: Must be detailed explanation with specific evidence
        4. evidence_sentences: Must include at least 2-3 specific quotes from the article
        5. supporting_links: Must be empty array []
        
        IMPORTANT: All fields are required. Do not skip any field. Provide specific, detailed responses.
        `,
        providers: providers //FIX HUGGINGFACE API KEY`
      //verification sources bugging out
    }, async (response) => {
      console.log('Raw API Response:', response);
      console.log('Response providers:', response?.providers);
      console.log('Response data:', response?.data);

      if (!response?.data) {
        console.error('Analysis failed - no response data received');
        setError('Failed to get analysis response');
        setIsAnalyzing(false);
        return;
      }

      // Track failed providers
      const failedOnes = response.data
        .map((r: any, i: number) => ({ result: r, provider: response.providers[i] }))
        .filter(({ result }: { result: { status: string } }) => result.status === 'rejected')
        .map(({ provider }: { provider: string }) => provider);
      
      setFailedProviders(failedOnes);

      // Check if all providers failed
      if (failedOnes.length === response.providers.length) {
        console.error('All providers failed');
        setError('All analysis providers failed. Please try again later.');
        setIsAnalyzing(false);
        return;
      }

      try {
        // Parse and validate results
        const successfulResults = await Promise.all(
          response.data
            .filter((r: any) => r.status === 'fulfilled')
            .map(async (r: any, i: number) => {
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
                    
                    // Parse evidence sentences with their impact
                    let evidenceSentences = [];
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
                      supporting_links: [] // Always start with empty array, will be filled by web search
                    };
                  }
                } else {
                  parsedResult = r.value;
                }

                if (!parsedResult) {
                  console.error('No parsed result available');
                  return null;
                }

                // Ensure all required fields exist with fallbacks
                if (typeof parsedResult.credibility_score !== 'number') {
                  console.error('Missing credibility_score:', parsedResult);
                  return null;
                }
                
                // Add missing fields with defaults
                parsedResult.credibility_summary = parsedResult.credibility_summary || 'No summary provided';
                parsedResult.reasoning = parsedResult.reasoning || 'No reasoning provided';
                parsedResult.evidence_sentences = parsedResult.evidence_sentences || [];
                parsedResult.supporting_links = parsedResult.supporting_links || [];
                
                // Validate remaining structure
                if (typeof parsedResult.credibility_summary !== 'string' ||
                    typeof parsedResult.reasoning !== 'string' ||
                    !Array.isArray(parsedResult.evidence_sentences) ||
                    !Array.isArray(parsedResult.supporting_links)) {
                  console.error('Invalid result structure after fallbacks:', parsedResult);
                  setError('Failed to parse analysis results. Please try again.');
                  return null;
                }

                return {
                  provider: response.providers?.[i] || 'Unknown Provider',
                  result: parsedResult
                };
              } catch (e) {
                console.error('Error parsing result for provider:', response.providers?.[i], e);
                return null;
              }
            })
        );

        const validResults = successfulResults.filter((x): x is NonNullable<typeof x> => x !== null);
        
        // Update provider statuses based on final results
        console.log('Final results - Valid:', validResults.length, 'Failed:', failedProviders.length);
        
        // Update statuses based on final results
        const finalStatuses: {[key: string]: 'waiting' | 'analyzing' | 'complete' | 'failed'} = {};
        
        // Mark all providers as failed initially
        providers.forEach((provider: string) => {
          finalStatuses[provider] = 'failed';
        });
        
        // Mark successful providers as complete
        validResults.forEach(result => {
          if (result.provider) {
            finalStatuses[result.provider] = 'complete';
          }
        });
        
        // Force immediate status update
        console.log('Setting final statuses:', finalStatuses);
        setProviderStatuses({...finalStatuses}); // Force new object reference

        if (validResults.length > 0) {
          // Extract key terms from the title for broader search
          const keyTerms = pageInfo.title
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .split(' ')
            .filter(word => word.length > 3) // Filter out short words
            .slice(0, 6) // Take first 6 meaningful words
            .join(' ');
          
          const searchQuery = keyTerms;
          
          
          // Search for verification sources with more specific query
          const searchTimeout = setTimeout(() => {
            console.log('Web search timed out, continuing with analysis');
            // Add timeout message to supporting_links for display in UI
            validResults.forEach(result => {
              result.result.supporting_links = ['Web search timed out. Please verify this information independently.'];
            });
            
            // Show analysis results even if web search times out
            setAnalysis(validResults);
            setShowButton(false);
            setIsAnalyzing(false);
          }, 10000); // 10 second timeout
          
          chrome.runtime.sendMessage({ 
            type: 'WEB_SEARCH', 
            query: searchQuery,
            max_results: 5
          }, (searchResponse: { 
            success: boolean; 
            data?: { 
              results: Array<{ 
                url: string;
              }> 
            } 
          }) => {
            // Clear the timeout since we got a response
            clearTimeout(searchTimeout);
            
            const results = searchResponse?.data?.results;
            if (searchResponse?.success && results && results.length > 0) {
              // Add real URLs to all results
              const verificationUrls = results
                .filter((r: { url: string }) => r.url.startsWith('http'))
                .map((r: { url: string }) => r.url)
                .slice(0, 5);
                
              validResults.forEach(result => {
                result.result.supporting_links = verificationUrls;
              });
            } else {
              console.log('Web search failed or returned no results, but continuing with analysis');
              // Add error message to supporting_links for display in UI
              validResults.forEach(result => {
                result.result.supporting_links = ['No verification sources found. Please verify this information independently.'];
              });
            }
            
            // Always show analysis results, regardless of web search success
            setAnalysis(validResults);
            setShowButton(false);
            
            // Add a small delay before hiding the loading screen to ensure all provider statuses are visible
            setTimeout(() => {
              setIsAnalyzing(false);
            }, 1500); // 1.5 second delay to show final provider statuses
          });
          
          // Handle case where chrome.runtime.sendMessage fails entirely
          if (chrome.runtime.lastError) {
            console.log('Chrome runtime error during web search, continuing with analysis');
            clearTimeout(searchTimeout);
            
            // Add error message to supporting_links for display in UI
            validResults.forEach(result => {
              result.result.supporting_links = ['Web search failed due to technical issues. Please verify this information independently.'];
            });
            
            // Show analysis results even if web search fails
            setAnalysis(validResults);
            setShowButton(false);
            setIsAnalyzing(false);
          }
        } else {
          setError('Failed to parse analysis results. Please try again.');
          setTimeout(() => {
            setIsAnalyzing(false);
          }, 1500);
        }
      } catch (e) {
        console.error('Error processing analysis results:', e);
        setError('An error occurred while processing the results.');
        setTimeout(() => {
          setIsAnalyzing(false);
        }, 1500);
      }
      
    });
  }



  return (
    <div className={styles.container}>
      {/* Modern Analysis Loading Overlay */}
      {isAnalyzing && (
        <div className={styles.analysisLoadingState}>
          <div className={styles.analysisLoadingContent}>
            <h2 className={styles.analysisLoadingTitle}>Analyzing Article</h2>
            <p className={styles.analysisLoadingSubtitle}>
              AI models are currently evaluating the credibility of this content
            </p>
            
            <div className={styles.modernSpinner}>
              <div className={styles.spinnerRing}></div>
              <div className={styles.spinnerRing}></div>
              <div className={styles.spinnerRing}></div>
            </div>
            
            <div className={styles.typewriterContainer}>
              <div className={styles.typewriterText}>
                {analysisSteps[currentStep]}
              </div>
            </div>
            
            <div className={styles.aiProviders}>
              {Object.entries(providerStatuses).map(([provider, status]) => (
                <div key={`${provider}-${status}`} className={`${styles.providerStatus} ${status === 'complete' ? styles.complete : status === 'failed' ? styles.failed : ''}`}>
                  <span className={styles.providerName}>{provider}</span>
                  <div className={`${styles.statusDot} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.header}>
        <h1 className={styles.title}>Fake News Reader</h1>
        <div className={styles.headerButtons}>
          <button 
            className={`${styles.button} ${!hasAttemptedAnalysis ? styles.headerButtonHidden : ''}`} 
            onClick={getPageInfo}
          >
            New Analysis
          </button>
          {hasAttemptedAnalysis && (
            <button 
              className={styles.resetButton} 
              onClick={resetState}
              title="Reset to welcome screen"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {pageInfo ? (
          <>
            <h2 className={styles.pageTitle}>
              {pageInfo.title || 'No title found'}
            </h2>
            
            {/* Show PageDetails only when not analyzing AND no analysis results yet */}
            {!isAnalyzing && analysis.length === 0 && <PageDetails pageInfo={pageInfo} />}
            
            {/* Show analysis results when available */}
            {analysis.length > 0 && (
              <AnalysisResults 
                analysis={analysis}
                selectedProvider={selectedProvider}
                onProviderSelect={setSelectedProvider}
              />
            )}
            
            <FailedProviders providers={failedProviders} />
          </>
        ) : isDetectingPage ? (
          <div className={styles.loadingState}>
            <p>Detecting article content...</p>
            <p>Please wait while we analyze this page.</p>
          </div>
        ) : hasAttemptedAnalysis ? (
          <div className={styles.errorState}>
            <div className={styles.errorMessage}>
              {error || "Unable to analyze this page"}
            </div>
            <p className={styles.errorDescription}>
              Click "New Analysis" above to try a different page, or "Try Again" to retry this page.
            </p>
            <button className={styles.button} onClick={getPageInfo}>
              Try Again
            </button>
          </div>
        ) : (
          <div className={styles.starterScreen}>
            <div className={styles.starterIcon}>LOGO</div> {/* TODO: Add logo */}
            <h2>TITLE</h2> {/* TODO: Add title */}
            <p>This web extension helps you analyze the credibility of news articles using multiple AI models; returning you a structured analysis of the article, including a credibility score, summary, reasoning, and evidence sentences. The extension also provides a list of supporting links to help you verify the information.</p>
            <div className={styles.starterSteps}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>1</span>
                <span>Navigate to a news article</span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>2</span>
                <span>Click "New Analysis" to detect the article and its content</span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>3</span>
                <span>Click "Analyze Article" to get AI insights</span>
              </div>
            </div>
            <button className={styles.button} onClick={getPageInfo}>
              Start Analysis
            </button>
          </div>
        )}
      </div>
      
      {/* Fixed Analyze Button - Only show when no analysis results yet */}
      {pageInfo && !isAnalyzing && analysis.length === 0 && (
        <div className={styles.fixedAnalyzeButton}>
          <button 
            className={styles.analyzeButton} 
            onClick={analyzeArticle}
          >
            Analyze Article
          </button>
        </div>
      )}
    </div>
  );
}

export default App; 