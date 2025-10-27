import React, { useEffect } from 'react';
import { AnalysisResults } from './components/AnalysisResults';
import { PageLoadingState, AnalysisLoadingState, ErrorState } from './components/LoadingStates';
import { useAnalysisState } from '../../hooks/useAnalysisState';
import { useMessageHandlers } from '../../hooks/useMessageHandlers';
import { createTimerFunctions, shouldSkipAutoAnalysis, shouldExpandSidebar } from '../../utils/analysisHelpers';
import { getPageInfo, analyzeArticle, loadAnalysisForUrl } from '../../utils/analysisOperations';
import { getMulti, setStorage } from '../../utils/storage';
import styles from './styles/App.module.css';

function App() {
  const [state, refs, setters] = useAnalysisState();
  const { resetState } = useMessageHandlers({ state, refs, setters });
  const { startTimer, endTimer } = createTimerFunctions(refs.timersRef);

  // Initialize UI
  useEffect(() => {
    (async () => {
      const { selectedPage, hasAttemptedAnalysis: storedHasAttempted } = await getMulti([
        'selectedPage',
        'hasAttemptedAnalysis',
      ] as const);
      setters.setSelectedPage(selectedPage || 'home');
      setters.setHasAttemptedAnalysis(storedHasAttempted || false);
      setters.setUiReady(true);
    })();
  }, []);

  // Auto-start analysis when UI is ready
  useEffect(() => {
    if (state.uiReady && !state.autoStarted) {
      setters.setAutoStarted(true);
    }
  }, [state.uiReady, state.autoStarted]);

  // Handle auto-analysis logic
  useEffect(() => {
    if (state.autoStarted && state.pageInfo && state.analysis.length === 0 && !refs.analysisTriggeredRef.current) {
      const skipCheck = shouldSkipAutoAnalysis(
        state.isManualTrigger,
        state.isViewingFromRecent,
        state.hasExistingAnalysis,
        state.hasPreloadedAnalysis,
        state.requiresManualTrigger,
        state.pageInfo.url
      );

      if (skipCheck.shouldSkip) {
        return;
      }
      
      refs.analysisTriggeredRef.current = true;
      handleAnalyzeArticle();
    }
  }, [
    state.autoStarted, 
    state.pageInfo, 
    state.analysis.length, 
    state.isViewingFromRecent, 
    state.isManualTrigger, 
    state.hasExistingAnalysis, 
    state.hasPreloadedAnalysis, 
    state.requiresManualTrigger
  ]);

  // Auto-expand sidebar when analysis results are available
  useEffect(() => {
    const shouldExpand = shouldExpandSidebar(state.analysis.length, state.isAnalyzing, state.isViewingFromSimilar);
    
    if (shouldExpand) {
      // Trigger expansion by sending a message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab?.id) {
          chrome.tabs.sendMessage(currentTab.id, { 
            type: 'EXPAND_FOR_ANALYSIS',
            expanded: true 
          }).catch(() => {
            // Ignore errors if content script isn't ready
          });
        }
      });
    } else if (state.analysis.length === 0 && !state.isAnalyzing) {
      // Collapse when analysis is cleared
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab?.id) {
          chrome.tabs.sendMessage(currentTab.id, { 
            type: 'EXPAND_FOR_ANALYSIS',
            expanded: false 
          }).catch(() => {
            // Ignore errors if content script isn't ready
          });
        }
      });
    }
  }, [state.analysis.length, state.isAnalyzing, state.isViewingFromSimilar]);

  // Cycle through analysis steps during loading

  // Handle page info loading with manual trigger support
  const handleGetPageInfo = async (isManualTrigger = false) => {
    await getPageInfo(
      isManualTrigger,
      {
        setError: setters.setError,
        setPageInfo: setters.setPageInfo,
        setAnalysis: setters.setAnalysis,
        setFailedProviders: setters.setFailedProviders,
        setShowButton: setters.setShowButton,
        setHasAttemptedAnalysis: setters.setHasAttemptedAnalysis,
        setIsDetectingPage: setters.setIsDetectingPage,
        setIsPageLoading: setters.setIsPageLoading,
      },
      {
        isViewingFromRecent: state.isViewingFromRecent,
        hasExistingAnalysis: state.hasExistingAnalysis,
        hasPreloadedAnalysis: state.hasPreloadedAnalysis,
        requiresManualTrigger: state.requiresManualTrigger,
      },
      {
        analysisTriggeredRef: refs.analysisTriggeredRef,
      }
    );
  };

  // Handle article analysis
  const handleAnalyzeArticle = async () => {
    await analyzeArticle(
      state.pageInfo,
      refs.requestIdRef,
      {
        setError: setters.setError,
        setAnalysis: setters.setAnalysis,
        setFailedProviders: setters.setFailedProviders,
        setSelectedProvider: setters.setSelectedProvider,
        setProviderStatuses: setters.setProviderStatuses,
        setIsAnalyzing: setters.setIsAnalyzing,
        setIsDetectingPage: setters.setIsDetectingPage,
        setHasAttemptedAnalysis: setters.setHasAttemptedAnalysis,
        setHasExistingAnalysis: setters.setHasExistingAnalysis,
        setShowButton: setters.setShowButton,
      },
      {
        isManualTrigger: state.isManualTrigger,
        isViewingFromRecent: state.isViewingFromRecent,
        hasPreloadedAnalysis: state.hasPreloadedAnalysis,
        requiresManualTrigger: state.requiresManualTrigger,
      }
    );
  };

  // Handle "Done" button click
  const handleNewAnalysis = () => {
    if (state.isViewingFromRecent) {
      // Close the current tab and switch back to original tab if viewing from recent analysis
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab?.id) {
          if (state.originalTabId) {
            chrome.tabs.update(state.originalTabId, { active: true }, () => {
              if (currentTab.id) {
                chrome.tabs.remove(currentTab.id);
              }
            });
          } else {
            chrome.tabs.remove(currentTab.id);
          }
        }
      });
    } else {
      // Reset internal/background state
      resetState();
      // Ask content script to remove the injected sidebar
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_INJECTED_SIDEBAR', keepOpen: false });
          }
        });
      } catch (e) {
        console.warn('Failed to send close message to content script', e);
      }
    }
  };

  // Handle loading analysis for URL
  const handleLoadAnalysisForUrl = async (url: string, timestamp?: number) => {
    await loadAnalysisForUrl(url, timestamp, {
      setError: setters.setError,
    });
  };

  // Handle retry on error
  const handleRetry = () => {
    if (!state.isViewingFromRecent) {
      handleGetPageInfo();
    }
  };

  if (!state.uiReady) {
    return <div className={styles.container}><div className={styles.loading}>Loading…</div></div>;
  }

  return (
    <div className={`${styles.container}`}>
      {state.selectedPage === 'home' && (
        <>
          {state.isPageLoading && <PageLoadingState />}

          {state.isAnalyzing && !state.isPageLoading && <AnalysisLoadingState />}

          {!state.isPageLoading && !state.isAnalyzing && (
            <div className={styles.content}>
              {state.analysis.length > 0 ? (
                <AnalysisResults 
                  analysis={state.analysis}
                  selectedProvider={state.selectedProvider}
                  onProviderSelect={setters.setSelectedProvider}
                  onNewAnalysis={handleNewAnalysis}
                  isViewingFromRecent={state.isViewingFromRecent}
                  onLoadAnalysisForUrl={handleLoadAnalysisForUrl}
                />
              ) : state.error ? (
                <ErrorState
                  error={state.error}
                  onRetry={handleRetry}
                  canRetry={!state.isViewingFromRecent}
                />
              ) : null}
            </div>
          )}
        </>
      )}

      {state.selectedPage === 'settings' && null}
    </div>
  );
}

export default App;
