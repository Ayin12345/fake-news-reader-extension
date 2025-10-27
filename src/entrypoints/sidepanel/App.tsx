import React, { useEffect, useState, useCallback } from 'react';
import { AnalysisResults } from './components/AnalysisResults';
import { AnalysisLoadingState, ErrorState, InitialLoadingState } from './components/LoadingStates';
import { useAnalysisState } from '../../hooks/useAnalysisState';
import { useMessageHandlers } from '../../hooks/useMessageHandlers';
import { useLayoutRefresh } from '../../hooks/useLayoutRefresh';
import { createTimerFunctions, shouldSkipAutoAnalysis, shouldExpandSidebar } from '../../utils/analysisHelpers';
import { getPageInfo, analyzeArticle, loadAnalysisForUrl } from '../../utils/analysisOperations';
import { getMulti, setStorage } from '../../utils/storage';
import styles from './styles/App.module.css';

function App() {
  console.log('🏁 App component starting render');
  
  const [state, refs, setters] = useAnalysisState();
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [tabStateChecked, setTabStateChecked] = useState(false);
  const { resetState } = useMessageHandlers({ state, refs, setters });
  const { startTimer, endTimer } = createTimerFunctions(refs.timersRef);
  const { forceLayoutRefresh } = useLayoutRefresh();

  // Listen for provider updates
  useEffect(() => {
    const handleProviderUpdate = (message: { type: string; status: string; error?: string }) => {
      if (message.type === 'PROVIDER_UPDATE' && message.status === 'failed') {
        // First clear any loading states
        setters.setIsAnalyzing(false);
        setters.setIsPageLoading(false);
        setters.setIsDetectingPage(false);
        
        // Then set the error
        setters.setError(message.error || 'Analysis failed. Please try again.');
      }
    };

    chrome.runtime.onMessage.addListener(handleProviderUpdate);
    return () => chrome.runtime.onMessage.removeListener(handleProviderUpdate);
  }, [
    setters.setIsAnalyzing,
    setters.setIsPageLoading,
    setters.setIsDetectingPage,
    setters.setError,
  ]);

  // Log initial state only in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Initial state:', {
      isInitializing,
      isTabVisible,
      uiReady: state.uiReady,
      isPageLoading: state.isPageLoading,
      isAnalyzing: state.isAnalyzing,
      hasPageInfo: !!state.pageInfo,
      analysisLength: state.analysis.length,
      error: state.error
    });
  }

  // Handle page info loading with manual trigger support
  const handleGetPageInfo = useCallback(async (isManualTrigger = false) => {
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
  }, [
    state.isViewingFromRecent,
    state.hasExistingAnalysis,
    state.hasPreloadedAnalysis,
    state.requiresManualTrigger,
    refs.analysisTriggeredRef,
    setters.setError,
    setters.setPageInfo,
    setters.setAnalysis,
    setters.setFailedProviders,
    setters.setShowButton,
    setters.setHasAttemptedAnalysis,
    setters.setIsDetectingPage,
    setters.setIsPageLoading,
  ]);

  // Handle article analysis
  const handleAnalyzeArticle = useCallback(async () => {
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
  }, [
    state.pageInfo,
    state.isManualTrigger,
    state.isViewingFromRecent,
    state.hasPreloadedAnalysis,
    state.requiresManualTrigger,
    refs.requestIdRef,
    setters.setError,
    setters.setAnalysis,
    setters.setFailedProviders,
    setters.setSelectedProvider,
    setters.setProviderStatuses,
    setters.setIsAnalyzing,
    setters.setIsDetectingPage,
    setters.setHasAttemptedAnalysis,
    setters.setHasExistingAnalysis,
    setters.setShowButton,
  ]);

  // Track tab visibility for UI key changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize UI
  useEffect(() => {
    console.log('🔄 Starting UI initialization effect');
    let mounted = true;
    
    const initializeUI = async () => {
      console.log('⚡ Starting UI initialization');
      try {
        console.log('📦 Getting stored state...');
        const { selectedPage, hasAttemptedAnalysis: storedHasAttempted } = await getMulti([
          'selectedPage',
          'hasAttemptedAnalysis',
        ] as const);
        console.log('📦 Got stored state:', { selectedPage, storedHasAttempted });

        if (!mounted) {
          console.log('❌ Component unmounted during initialization');
          return;
        }

        console.log('🔄 Setting initial state...');
        setters.setSelectedPage(selectedPage || 'home');
        setters.setHasAttemptedAnalysis(storedHasAttempted || false);
        setters.setUiReady(true);
        setIsInitializing(false);
        // Only now make the sidebar visible
        setIsReady(true);
        console.log('✅ UI initialization complete');
      } catch (error) {
        console.error('❌ UI initialization failed:', error);
        if (!mounted) {
          console.log('❌ Component unmounted during error handling');
          return;
        }

        console.log('⚠️ Setting error state');
        // First clear any loading states
        setters.setIsAnalyzing(false);
        setters.setIsPageLoading(false);
        setters.setIsDetectingPage(false);
        
        // Then set error and UI states
        setters.setError('Failed to initialize. Please try again.');
        setters.setUiReady(true);
        setIsInitializing(false);
        // Even on error, we should show the UI
        setIsReady(true);
      }
    };

    initializeUI();

    return () => {
      console.log('🧹 Cleaning up UI initialization effect');
      mounted = false;
    };
  }, [
    setters.setSelectedPage,
    setters.setHasAttemptedAnalysis,
    setters.setUiReady,
  ]);

  // Early-load background tab state to detect history/preloaded flows before any auto-start
  useEffect(() => {
    let cancelled = false;
    // Fail-safe: if background never responds, unblock auto-start after a short delay
    const failSafe = setTimeout(() => {
      if (!cancelled) {
        setTabStateChecked(true);
      }
    }, 1200);
    const loadTabStateEarly = () => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const currentTab = tabs[0];
          if (!currentTab?.id) return;
          chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId: currentTab.id }, (response) => {
            if (cancelled) return;
            if (response?.success && response.data) {
              const s = response.data;
              // If background marked this tab as history/preloaded, set flags and data immediately
              if (s.isViewingFromRecent || s.hasPreloadedAnalysis) {
                // Clear all loading states to avoid spinner flips
                setters.setIsAnalyzing(false);
                setters.setIsPageLoading(false);
                setters.setIsDetectingPage(false);
                // Apply data if present
                if (s.pageInfo) setters.setPageInfo(s.pageInfo);
                if (Array.isArray(s.analysis)) setters.setAnalysis(s.analysis);
                setters.setFailedProviders(s.failedProviders || []);
                setters.setShowButton(false);
                setters.setHasAttemptedAnalysis(true);
                setters.setHasExistingAnalysis((s.analysis || []).length > 0);
                setters.setIsViewingFromRecent(!!s.isViewingFromRecent);
                setters.setOriginalTabId(s.originalTabId);
                setters.setHasPreloadedAnalysis(!!s.hasPreloadedAnalysis);
                setters.setRequiresManualTrigger(false);
                // Prevent any auto-triggers
                refs.analysisTriggeredRef.current = true;
              }
            }
            // Mark that the tab state check completed (success or not)
            setTabStateChecked(true);
            clearTimeout(failSafe);
          });
        });
      } catch {}
    };
    loadTabStateEarly();
    return () => { cancelled = true; clearTimeout(failSafe); };
  }, []);

  // Auto-start analysis when UI is ready (but only if no analysis and not viewing history/preloaded)
  useEffect(() => {
    console.log('🔍 Checking auto-start conditions:', {
      uiReady: state.uiReady,
      autoStarted: state.autoStarted,
      isPageLoading: state.isPageLoading,
      isAnalyzing: state.isAnalyzing,
      hasPageInfo: !!state.pageInfo,
      analysisTriggered: refs.analysisTriggeredRef.current,
      analysisLength: state.analysis.length,
      isViewingFromRecent: state.isViewingFromRecent,
      hasPreloadedAnalysis: state.hasPreloadedAnalysis,
      tabStateChecked
    });

    let mounted = true;

    const startAnalysis = async () => {
      if (
        state.uiReady &&
        tabStateChecked &&
        !state.autoStarted &&
        state.analysis.length === 0 &&
        !state.isViewingFromRecent &&
        !state.hasPreloadedAnalysis
      ) {
        console.log('🚀 Starting auto-analysis');
        try {
          console.log('🔄 Setting autoStarted flag');
          setters.setAutoStarted(true);
          
          console.log('📄 Getting page info automatically');
          await handleGetPageInfo();
          console.log('✅ Auto-analysis page info complete');
        } catch (error) {
          console.error('❌ Auto-analysis failed:', error);
          if (!mounted) {
            console.log('❌ Component unmounted during auto-analysis');
            return;
          }

          console.log('⚠️ Resetting auto-analysis state');
          setters.setError('Failed to start analysis. Please try again.');
          setters.setIsPageLoading(false);
          setters.setIsDetectingPage(false);
          setters.setAutoStarted(false);
        }
      }
    };

    startAnalysis();

    return () => {
      console.log('🧹 Cleaning up auto-start effect');
      mounted = false;
    };
  }, [
    state.uiReady,
    tabStateChecked,
    state.autoStarted,
    handleGetPageInfo,
    setters.setError,
    setters.setIsPageLoading,
    setters.setIsDetectingPage,
    setters.setAutoStarted,
  ]);

  // Handle manual trigger for page info loading (skip while viewing history)
  useEffect(() => {
    console.log('🔍 Checking manual trigger conditions:', {
      isManualTrigger: state.isManualTrigger,
      hasPageInfo: !!state.pageInfo,
      isPageLoading: state.isPageLoading,
      isViewingFromRecent: state.isViewingFromRecent,
      isAnalyzing: state.isAnalyzing,
      analysisTriggered: refs.analysisTriggeredRef.current
    });

    let mounted = true;

    const handleManualTrigger = async () => {
      if (
        state.isManualTrigger &&
        !state.pageInfo &&
        !state.isPageLoading &&
        !state.isViewingFromRecent &&
        !state.hasPreloadedAnalysis
      ) {
        console.log('🚀 Starting manual trigger analysis');
        try {
          console.log('📄 Getting page info manually');
          await handleGetPageInfo(true);
          console.log('✅ Manual trigger page info complete');
        } catch (error) {
          console.error('❌ Manual trigger failed:', error);
          if (!mounted) {
            console.log('❌ Component unmounted during manual trigger');
            return;
          }

          console.log('⚠️ Resetting manual trigger state');
          setters.setError('Failed to analyze page. Please try again.');
          setters.setIsPageLoading(false);
          setters.setIsDetectingPage(false);
          setters.setIsManualTrigger(false);
        }
      }
    };

    handleManualTrigger();

    return () => {
      console.log('🧹 Cleaning up manual trigger effect');
      mounted = false;
    };
  }, [
    state.isManualTrigger,
    state.pageInfo,
    state.isPageLoading,
    state.isViewingFromRecent,
    state.hasPreloadedAnalysis,
    handleGetPageInfo,
    setters.setError,
    setters.setIsPageLoading,
    setters.setIsDetectingPage,
    setters.setIsManualTrigger,
  ]);

  // Handle auto-analysis logic (disabled while viewing history or preloaded)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Auto-analysis check:', {
        canStart: state.autoStarted && state.pageInfo && state.analysis.length === 0 && !refs.analysisTriggeredRef.current,
        reason: !state.autoStarted ? 'Not auto-started' :
                !state.pageInfo ? 'No page info' :
                state.analysis.length > 0 ? 'Already has analysis' :
                refs.analysisTriggeredRef.current ? 'Analysis already triggered' : 'Ready to start'
      });
    }

    let mounted = true;

    const startAutoAnalysis = async () => {
      if (
        state.autoStarted &&
        state.pageInfo &&
        state.analysis.length === 0 &&
        !refs.analysisTriggeredRef.current &&
        !state.isViewingFromRecent &&
        !state.hasPreloadedAnalysis
      ) {
        console.log('🚀 Starting auto-analysis check');
        try {
          console.log('🔍 Checking if analysis should be skipped');
          const skipCheck = shouldSkipAutoAnalysis(
            state.isManualTrigger,
            state.isViewingFromRecent,
            state.hasExistingAnalysis,
            state.hasPreloadedAnalysis,
            state.requiresManualTrigger,
            state.pageInfo.url
          );

          if (skipCheck.shouldSkip) {
            console.log('⏭️ Skipping auto-analysis:', skipCheck);
            // Ensure all loading states are cleared when skipping
            setters.setIsAnalyzing(false);
            setters.setIsPageLoading(false);
            setters.setIsDetectingPage(false);
            return;
          }
          
          console.log('🔄 Setting analysis triggered flag');
          refs.analysisTriggeredRef.current = true;
          
          console.log('📊 Starting article analysis');
          await handleAnalyzeArticle();
          console.log('✅ Auto-analysis complete');
        } catch (error) {
          console.error('❌ Auto-analysis failed:', error);
          if (!mounted) {
            console.log('❌ Component unmounted during auto-analysis');
            return;
          }

          console.log('⚠️ Resetting auto-analysis state');
          const errorMessage = error instanceof Error ? error.message : 'Failed to analyze article. Please try again.';
          setters.setError(errorMessage);
          setters.setIsAnalyzing(false);
          setters.setIsPageLoading(false);
          setters.setIsDetectingPage(false);
          refs.analysisTriggeredRef.current = false;
        }
      }
    };

    startAutoAnalysis();

    return () => {
      console.log('🧹 Cleaning up auto-analysis effect');
      mounted = false;
    };
  }, [
    state.autoStarted,
    state.pageInfo,
    state.analysis.length,
    state.isViewingFromRecent,
    state.isManualTrigger,
    state.hasExistingAnalysis,
    state.hasPreloadedAnalysis,
    state.requiresManualTrigger,
    handleAnalyzeArticle,
    setters.setError,
    setters.setIsAnalyzing,
    setters.setIsPageLoading,
    setters.setIsDetectingPage,
  ]);

  // Track loading state changes
  useEffect(() => {
    if (state.isPageLoading) {
      console.log('📄 Page Loading State: Active - Waiting for webpage to load');
    }
    if (!state.isPageLoading && (state.isAnalyzing || state.isDetectingPage)) {
      console.log('🔍 Analysis Loading State: Active - Reason:', {
        isAnalyzing: state.isAnalyzing ? 'Analyzing content' : false,
        isDetectingPage: state.isDetectingPage ? 'Preparing content' : false
      });
    }
  }, [state.isPageLoading, state.isAnalyzing, state.isDetectingPage]);

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

  // Log state changes in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🎨 State update:', {
      isPageLoading: state.isPageLoading,
      isAnalyzing: state.isAnalyzing,
      isDetectingPage: state.isDetectingPage,
      hasError: !!state.error,
      analysisLength: state.analysis.length
    });
  }

  // Don't render anything until we're ready
  if (!isReady) {
    return null;
  }

  // Determine if we're in any loading state
  const isLoading = state.isAnalyzing || state.isDetectingPage || state.isPageLoading;

  return (
    <div className={`${styles.container}`} key={isTabVisible ? 'visible' : 'hidden'}>
      {state.selectedPage === 'home' && (
        <>
          {isLoading && <AnalysisLoadingState key="loading" />}

          {!isLoading && (
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
