import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResults } from './components/AnalysisResults';
import styles from './styles/App.module.css';
// import { Settings } from './components/Settings';
import { getMulti, setStorage, getStorage } from '../../utils/storage';
import { buildAnalysisPrompt } from '../../utils/prompts';

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
  const [isPageLoading, setIsPageLoading] = useState(false); // New state for page loading
  const [error, setError] = useState('');
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [failedProviders, setFailedProviders] = useState<string[]>([]);
  const [showButton, setShowButton] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [hasAttemptedAnalysis, setHasAttemptedAnalysis] = useState(false); // Track if user has tried to analyze
  const [currentStep, setCurrentStep] = useState(0);
  const [providerStatuses, setProviderStatuses] = useState<{[key: string]: 'waiting' | 'analyzing' | 'complete' | 'failed'}>({});
  const [selectedPage, setSelectedPage] = useState<'home' | 'settings'>('home');
  const [uiReady, setUiReady] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [isViewingFromRecent, setIsViewingFromRecent] = useState(false);
  const [originalTabId, setOriginalTabId] = useState<number | undefined>();
  const [autoStarted, setAutoStarted] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);
  const [isManualTrigger, setIsManualTrigger] = useState(false);
  const [hasPreloadedAnalysis, setHasPreloadedAnalysis] = useState(false);
  const [requiresManualTrigger, setRequiresManualTrigger] = useState(false);
  const [isViewingFromSimilar, setIsViewingFromSimilar] = useState(false);
  const requestIdRef = useRef(0);
  const timersRef = useRef<{[key: string]: number}>({});
  const analysisTriggeredRef = useRef(false);

  const startTimer = (label: string) => {
    timersRef.current[label] = Date.now();
    console.log(`[FNR][TIMER][START] ${label}`);
  };
  const endTimer = (label: string) => {
    const t = timersRef.current[label];
    if (t) {
      const ms = Date.now() - t;
      console.log(`[FNR][TIMER][END] ${label} = ${ms}ms`);
      delete timersRef.current[label];
    } else {
      console.log(`[FNR][TIMER][END] ${label} (no start)`);
    }
  };
  

  useEffect(() => {
    (async () => {
      const { selectedPage, hasAttemptedAnalysis: storedHasAttempted, recentAnalyses } = await getMulti([
        'selectedPage',
        'hasAttemptedAnalysis',
        'recentAnalyses',
      ] as const);
      setSelectedPage(selectedPage || 'home');
      setHasAttemptedAnalysis(storedHasAttempted || false);
      setUiReady(true);
    })();
  }, []);

  // Listen for preloaded analysis from content script
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PRELOADED_ANALYSIS') {
        console.log('[FNR] === PRELOADED_ANALYSIS RECEIVED ===');
        console.log('Preloaded analysis data:', event.data.data);
        const analysisData = event.data.data;
        
        // Set the analysis data directly without going through loading state
        setPageInfo(analysisData.pageInfo);
        setAnalysis(analysisData.analysis || []);
        setFailedProviders(analysisData.failedProviders || []);
        setShowButton(false);
        setIsAnalyzing(false);
        setHasAttemptedAnalysis(true);
        setHasExistingAnalysis((analysisData.analysis || []).length > 0); // Set flag if we have existing analysis
        setIsViewingFromRecent(analysisData.isViewingFromRecent || false);
        setOriginalTabId(analysisData.originalTabId);
        
        // Set the preloaded analysis flag
        setHasPreloadedAnalysis(true);
        
        // Reset the manual trigger requirement since we have preloaded analysis
        setRequiresManualTrigger(false);
        
        // Reset the analysis trigger ref to prevent auto-analysis
        analysisTriggeredRef.current = true;
        
        console.log('[FNR] Preloaded analysis applied successfully');
        console.log('[FNR] Flags set:', {
          isViewingFromRecent: analysisData.isViewingFromRecent || false,
          hasExistingAnalysis: (analysisData.analysis || []).length > 0,
          hasPreloadedAnalysis: true,
          requiresManualTrigger: false,
          analysisTriggeredRef: true
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Auto-start analysis when UI is ready
  useEffect(() => {
    if (uiReady && !autoStarted) {
      console.log('[FNR] === AUTO-START CHECK ===');
      console.log('uiReady:', uiReady);
      console.log('autoStarted:', autoStarted);
      console.log('isViewingFromRecent:', isViewingFromRecent);
      console.log('hasExistingAnalysis:', hasExistingAnalysis);
      console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
      
      setAutoStarted(true);
      // Don't auto-check page loading - only do this when explicitly triggered
      // checkPageLoadingState();
      console.log('[FNR] Auto-start completed, not checking page loading');
    }
  }, [uiReady, autoStarted, isViewingFromRecent, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger]);

  // Track when user is viewing related links to prevent auto-analysis
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isViewingFromRecent) {
        console.log('[FNR] === VISIBILITY CHANGE - USER RETURNED FROM RELATED LINK ===');
        console.log('isViewingFromRecent:', isViewingFromRecent);
        console.log('hasExistingAnalysis:', hasExistingAnalysis);
        
        // Reset auto-analysis trigger to prevent new analysis
        analysisTriggeredRef.current = true;
        // Also prevent page info loading
        setIsPageLoading(false);
        
        console.log('[FNR] Auto-analysis disabled for related link return');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isViewingFromRecent, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger]);

  // Additional safeguard: prevent auto-analysis when viewing from recent
  useEffect(() => {
    if (isViewingFromRecent) {
      console.log('[FNR] === ADDITIONAL SAFEGUARD - VIEWING FROM RECENT ===');
      console.log('isViewingFromRecent:', isViewingFromRecent);
      console.log('hasExistingAnalysis:', hasExistingAnalysis);
      console.log('analysisTriggeredRef.current:', analysisTriggeredRef.current);
      
      // Disable auto-analysis
      analysisTriggeredRef.current = true;
      console.log('[FNR] Auto-analysis disabled - viewing from recent analysis');
    }
  }, [isViewingFromRecent, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger]);

  // Check if the current page is in a loading state
  const checkPageLoadingState = () => {
    console.log('[FNR] === CHECK_PAGE_LOADING_STATE CALLED ===');
    console.log('isViewingFromRecent:', isViewingFromRecent);
    console.log('hasExistingAnalysis:', hasExistingAnalysis);
    console.log('requiresManualTrigger:', requiresManualTrigger);
    
    // Don't check page loading if we're viewing from recent analysis
    if (isViewingFromRecent) {
      console.log('[FNR] Skipping checkPageLoadingState - viewing from recent analysis');
      return;
    }

    // Don't check page loading if we already have existing analysis
    if (hasExistingAnalysis) {
      console.log('[FNR] Skipping checkPageLoadingState - already have existing analysis');
      return;
    }

    // Don't check page loading if we have preloaded analysis
    if (hasPreloadedAnalysis) {
      console.log('[FNR] Skipping checkPageLoadingState - have preloaded analysis');
      return;
    }

    // Don't check page loading if this tab requires manual trigger
    if (requiresManualTrigger) {
      console.log('[FNR] Skipping checkPageLoadingState - tab requires manual trigger');
      return;
    }

    console.log('[FNR] Proceeding with checkPageLoadingState...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab?.id) {
        setError('No active tab found');
        return;
      }

      // Check if the page is still loading
      if (currentTab.status === 'loading') {
        setIsPageLoading(true);
        // Set up a listener to detect when the page finishes loading
        const checkLoadingStatus = () => {
          chrome.tabs.get(currentTab.id!, (tab) => {
            if (tab.status === 'complete') {
              setIsPageLoading(false);
              getPageInfo();
            } else if (tab.status === 'loading') {
              // Continue checking every 500ms
              setTimeout(checkLoadingStatus, 500);
            }
          });
        };
        checkLoadingStatus();
      } else {
        setIsPageLoading(false);
        getPageInfo();
      }
    });
  };

  // When page info arrives, only start analysis if explicitly triggered or from history
  useEffect(() => {
    if (autoStarted && pageInfo && analysis.length === 0 && !analysisTriggeredRef.current) {
      console.log('🚨🚨🚨 [FNR] AUTO-ANALYSIS CHECK RUNNING 🚨🚨🚨');
      console.log('🚨🚨🚨 THIS MAY TRIGGER UNWANTED ANALYSIS 🚨🚨🚨');
      console.log('[FNR] === AUTO-ANALYSIS CHECK ===');
      console.log('autoStarted:', autoStarted);
      console.log('pageInfo exists:', !!pageInfo);
      console.log('analysis.length:', analysis.length);
      console.log('analysisTriggeredRef.current:', analysisTriggeredRef.current);
      console.log('isViewingFromRecent:', isViewingFromRecent);
      console.log('isManualTrigger:', isManualTrigger);
      console.log('hasExistingAnalysis:', hasExistingAnalysis);
      console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
      console.log('requiresManualTrigger:', requiresManualTrigger);
      console.log('isViewingFromSimilar:', isViewingFromSimilar);

      // 🚨🚨🚨 CRITICAL: NEVER auto-analyze unless extension icon was clicked 🚨🚨🚨
      if (!isManualTrigger) {
        console.log('🚨🚨🚨 [FNR] BLOCKING AUTO-ANALYSIS: NO MANUAL TRIGGER 🚨🚨🚨');
        console.log('🚨🚨🚨 ANALYSIS ONLY ALLOWED WHEN EXTENSION ICON CLICKED 🚨🚨🚨');
        return;
      }
      
      // Don't auto-analyze certain pages
      const skipAnalysisPages = [
        'console.cloud.google.com',
        'developers.google.com',
        'apis.google.com',
        'www.googleapis.com',
        'chrome://',
        'chrome-extension://',
        'moz-extension://',
        'edge://',
        'about://',
        'chrome-devtools://',
        'devtools://'
      ];
      
      const shouldSkip = skipAnalysisPages.some(page => 
        pageInfo.url.includes(page)
      );
      
      if (shouldSkip) {
        console.log('[FNR] Skipping auto-analysis on restricted page:', pageInfo.url);
        return;
      }
      
      // Additional safeguard: prevent auto-analysis if we're in any special state
      // BUT: Allow analysis if we have a manual trigger (extension icon clicked)
      if (isViewingFromRecent || hasExistingAnalysis || hasPreloadedAnalysis || (requiresManualTrigger && !isManualTrigger)) {
        console.log('[FNR] Skipping auto-analysis - in special state');
        console.log('Details:', {
          isViewingFromRecent,
          hasExistingAnalysis, 
          hasPreloadedAnalysis,
          requiresManualTrigger,
          isManualTrigger,
          blockReason: isViewingFromRecent ? 'viewing from recent' : 
                      hasExistingAnalysis ? 'has existing analysis' :
                      hasPreloadedAnalysis ? 'has preloaded analysis' :
                      (requiresManualTrigger && !isManualTrigger) ? 'requires manual trigger but no manual trigger' :
                      'unknown'
        });
        return;
      }
      
      analysisTriggeredRef.current = true;
      console.log('🚨🚨🚨 [FNR] AUTO-ANALYSIS TRIGGERED! 🚨🚨🚨');
      console.log('🚨🚨🚨 THIS SHOULD NOT HAPPEN FOR RELATED ARTICLES 🚨🚨🚨');
      console.log('[FNR] Auto-starting analyzeArticle after pageInfo (manual trigger only)');
      analyzeArticle();
    }
  }, [autoStarted, pageInfo, analysis.length, isViewingFromRecent, isManualTrigger, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger]);

  // Auto-expand when analysis results are available
  useEffect(() => {
    console.log('[FNR] === AUTO-EXPANSION CHECK ===');
    console.log('analysis.length:', analysis.length);
    console.log('isAnalyzing:', isAnalyzing);
    console.log('isViewingFromRecent:', isViewingFromRecent);
    console.log('hasExistingAnalysis:', hasExistingAnalysis);
    console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
    
    // NEW: Only expand if we have analysis AND it's not from similar/related article
    const shouldExpand = analysis.length > 0 && !isAnalyzing && !isViewingFromSimilar;
    if (shouldExpand) {
      console.log('🔥🔥🔥 SIDEBAR OPENER #2: AUTO-EXPANSION FROM ANALYSIS RESULTS 🔥🔥🔥');
      console.log('🔥🔥🔥 THIS SHOULD ONLY HAPPEN AFTER EXTENSION ICON CLICK 🔥🔥🔥');
      console.log('🚨🚨🚨 [FNR] SIDEBAR EXPANSION TRIGGERED 🚨🚨🚨');
      console.log('🚨🚨🚨 REASON: analysis.length > 0 && !isAnalyzing && !isViewingFromSimilar 🚨🚨🚨');
      console.log('🚨🚨🚨 ANALYSIS LENGTH:', analysis.length, '🚨🚨🚨');
      console.log('🚨🚨🚨 IS ANALYZING:', isAnalyzing, '🚨🚨🚨');
      console.log('🚨🚨🚨 IS VIEWING FROM RECENT:', isViewingFromRecent, '🚨🚨🚨');
      console.log('🚨🚨🚨 IS VIEWING FROM SIMILAR:', isViewingFromSimilar, '🚨🚨🚨');
      console.log('🚨🚨🚨 HAS PRELOADED ANALYSIS:', hasPreloadedAnalysis, '🚨🚨🚨');
      console.log('🚨🚨🚨 REQUIRES MANUAL TRIGGER:', requiresManualTrigger, '🚨🚨🚨');
      console.log('🚨🚨🚨 SIDEBAR WILL NOW EXPAND 🚨🚨🚨');
      
      // Trigger expansion by sending a message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab?.id) {
          console.log('🔥🔥🔥 SENDING EXPAND MESSAGE TO CONTENT SCRIPT (OPENER #2) 🔥🔥🔥');
          chrome.tabs.sendMessage(currentTab.id, { 
            type: 'EXPAND_FOR_ANALYSIS',
            expanded: true 
          }).catch(() => {
            // Ignore errors if content script isn't ready
          });
        }
      });
    } else {
      console.log('🚨🚨🚨 [FNR] SIDEBAR EXPANSION BLOCKED 🚨🚨🚨');
      console.log('🚨🚨🚨 REASON: analysis.length > 0 && !isAnalyzing && !isViewingFromSimilar =', analysis.length > 0 && !isAnalyzing && !isViewingFromSimilar, '🚨🚨🚨');
      console.log('🚨🚨🚨 analysis.length:', analysis.length, 'isAnalyzing:', isAnalyzing, 'isViewingFromSimilar:', isViewingFromSimilar, '🚨🚨🚨');
      
      if (isViewingFromSimilar) {
        console.log('🚨🚨🚨 EXPANSION BLOCKED: VIEWING FROM SIMILAR/RELATED ARTICLE 🚨🚨🚨');
      }
      
        // If we had analysis before but now don't, collapse the sidebar
        // BUT: Don't collapse if we're currently analyzing (loading state)
        if (analysis.length === 0 && !isAnalyzing) {
          console.log('🔥🔥🔥 SIDEBAR OPENER #3: COLLAPSE LOGIC (NOT OPENING BUT CLOSING) 🔥🔥🔥');
          console.log('🚨🚨🚨 [FNR] SIDEBAR COLLAPSE TRIGGERED 🚨🚨🚨');
          console.log('🚨🚨🚨 REASON: analysis.length === 0 && !isAnalyzing 🚨🚨🚨');
          console.log('🚨🚨🚨 SIDEBAR WILL NOW COLLAPSE 🚨🚨🚨');
          
          // Collapse when analysis is cleared
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab?.id) {
              console.log('🔥🔥🔥 SENDING COLLAPSE MESSAGE TO CONTENT SCRIPT (OPENER #3) 🔥🔥🔥');
              chrome.tabs.sendMessage(currentTab.id, { 
                type: 'EXPAND_FOR_ANALYSIS',
                expanded: false 
              }).catch(() => {
                // Ignore errors if content script isn't ready
              });
            }
          });
        } else if (analysis.length === 0 && isAnalyzing) {
          console.log('🚨🚨🚨 [FNR] COLLAPSE BLOCKED: CURRENTLY ANALYZING 🚨🚨🚨');
          console.log('🚨🚨🚨 KEEPING SIDEBAR OPEN DURING ANALYSIS 🚨🚨🚨');
        }
    }
  }, [analysis.length, isAnalyzing, isViewingFromRecent, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger, isViewingFromSimilar]);

  

  const selectPage = async (page: 'home' | 'settings') => {
    setSelectedPage(page);
    await setStorage('selectedPage', page);
  };

  const resetState = () => {
    console.log('[FNR] === RESET_STATE CALLED ===');
    console.log('Resetting all state variables...');
    
    // First reset local state
    setError('');
    setPageInfo(null);
    setAnalysis([]);
    setFailedProviders([]);
    setShowButton(true);
    // Keep hasAttemptedAnalysis and history
    setCurrentStep(0);
    setProviderStatuses({});
    setIsDetectingPage(false);
    setIsAnalyzing(false);
    setIsPageLoading(false); // Reset page loading state
    setIsViewingFromRecent(false);
    setOriginalTabId(undefined);
    setHasExistingAnalysis(false);
    setIsManualTrigger(false);
    setHasPreloadedAnalysis(false);
    setRequiresManualTrigger(false);
    setIsViewingFromSimilar(false);
    
    // Reset the analysis trigger ref
    analysisTriggeredRef.current = false;
    
    console.log('[FNR] State reset complete');

    // Reset expansion state and collapse sidebar
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

    // Then reset background state for the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab?.id) return;
      chrome.runtime.sendMessage({ type: 'RESET_TAB_STATE', tabId: currentTab.id }, (response) => {
        if (!response?.success) {
          console.error('Failed to reset background state');
        }
      });
    });
  };


  // Update the useEffect to handle tab ID and visibility refresh
  useEffect(() => {
    const loadTabState = (targetTabId?: number) => {
      const fetchForTab = (tabId: number) => {
        chrome.runtime.sendMessage({ 
          type: 'GET_TAB_STATE',
          tabId
        }, (response) => {
          if (response?.success && response.data) {
            const state = response.data;
            console.log('=== TAB STATE LOADED ===');
            console.log('Loaded state:', {
              hasPageInfo: !!state.pageInfo,
              analysisLength: state.analysis?.length || 0,
              hasFailedProviders: !!state.failedProviders,
              showButton: state.showButton,
              isAnalyzing: state.isAnalyzing,
              isViewingFromRecent: state.isViewingFromRecent,
              originalTabId: state.originalTabId,
              hasPreloadedAnalysis: state.hasPreloadedAnalysis,
              requiresManualTrigger: state.requiresManualTrigger
            });
            
            console.log('🚨🚨🚨 SIDEPANEL: LOADING TAB STATE 🚨🚨🚨');
            console.log('🚨🚨🚨 THIS MAY TRIGGER SIDEBAR EXPANSION 🚨🚨🚨');
            
            setPageInfo(state.pageInfo);
            setAnalysis(state.analysis || []);
            setFailedProviders(state.failedProviders || []);
            setShowButton(typeof state.showButton === 'boolean' ? state.showButton : true);
            setIsAnalyzing(state.isAnalyzing || false);
            setIsViewingFromRecent(state.isViewingFromRecent || false);
            setOriginalTabId(state.originalTabId);
            setHasExistingAnalysis((state.analysis || []).length > 0); // Set flag if we have existing analysis
            setHasPreloadedAnalysis(state.hasPreloadedAnalysis || false); // Set flag for preloaded analysis
            setRequiresManualTrigger(state.requiresManualTrigger || false); // Set flag for manual trigger requirement
            setIsPageLoading(false); // Reset page loading when loading state
            
            // 🚨🚨🚨 CRITICAL: Reset manual trigger when loading tab state (but preserve history state) 🚨🚨🚨
            console.log('🚨🚨🚨 [FNR] CHECKING IF SHOULD RESET MANUAL TRIGGER IN LOAD TAB STATE 🚨🚨🚨');
            console.log('🚨🚨🚨 State isViewingFromRecent:', state.isViewingFromRecent, '🚨🚨🚨');
            
            // Only reset manual trigger if this is NOT a history view
            if (!state.isViewingFromRecent) {
              console.log('🚨🚨🚨 [FNR] RESETTING MANUAL TRIGGER FLAG IN LOAD TAB STATE 🚨🚨🚨');
              setIsManualTrigger(false); // Reset manual trigger - only set to true when extension icon clicked
            } else {
              console.log('🚨🚨🚨 [FNR] NOT RESETTING MANUAL TRIGGER - THIS IS HISTORY VIEW 🚨🚨🚨');
            }
            
            console.log('🚨🚨🚨 SIDEPANEL: STATE VARIABLES SET 🚨🚨🚨');
            console.log('🚨🚨🚨 analysis.length:', state.analysis?.length || 0, '🚨🚨🚨');
            console.log('🚨🚨🚨 isViewingFromRecent:', state.isViewingFromRecent, '🚨🚨🚨');
            console.log('🚨🚨🚨 hasPreloadedAnalysis:', state.hasPreloadedAnalysis, '🚨🚨🚨');
            console.log('🚨🚨🚨 requiresManualTrigger:', state.requiresManualTrigger, '🚨🚨🚨');
            console.log('🚨🚨🚨 THIS MAY TRIGGER SIDEBAR EXPANSION LOGIC 🚨🚨🚨');
            
            // NEW: Detect if we're viewing from similar/related article
            if ((state.analysis?.length || 0) > 0 && !state.isViewingFromRecent && !isManualTrigger) {
              console.log('🚨🚨🚨 [FNR] DETECTED: VIEWING FROM SIMILAR/RELATED ARTICLE 🚨🚨🚨');
              console.log('🚨🚨🚨 SETTING isViewingFromSimilar = true 🚨🚨🚨');
              setIsViewingFromSimilar(true);
            }
            
            console.log('=== STATE LOAD ===');
            console.log('Loaded isViewingFromRecent:', state.isViewingFromRecent);
            console.log('Loaded originalTabId:', state.originalTabId);
            console.log('Analysis length:', state.analysis?.length || 0);
            console.log('Loaded hasPreloadedAnalysis:', state.hasPreloadedAnalysis);
            console.log('Loaded requiresManualTrigger:', state.requiresManualTrigger);
          }
        });
      };

      if (typeof targetTabId === 'number') {
        fetchForTab(targetTabId);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab?.id) {
          setError('No active tab found');
          return;
        }
        fetchForTab(currentTab.id);
      });
    };

    // Load initial state
    loadTabState();

    // Refresh when iframe becomes visible again
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        console.log('[FNR] === IFRAME VISIBILITY CHANGE ===');
        console.log('isViewingFromRecent:', isViewingFromRecent);
        console.log('hasExistingAnalysis:', hasExistingAnalysis);
        console.log('requiresManualTrigger:', requiresManualTrigger);
        
        // Only reload state if we're not viewing from recent
        if (!isViewingFromRecent) {
          console.log('[FNR] Reloading tab state due to visibility change');
          loadTabState();
        } else {
          console.log('[FNR] Skipping tab state reload - viewing from recent analysis');
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // Listen for messages from background script
    const handleMessages = (message: any) => {
      if (message.type === 'TAB_SWITCHED') {
        console.log('=== TAB_SWITCHED MESSAGE RECEIVED ===');
        console.log('Message:', message);
        console.log('Current isViewingFromRecent:', isViewingFromRecent);
        console.log('Current hasExistingAnalysis:', hasExistingAnalysis);
        console.log('Current hasPreloadedAnalysis:', hasPreloadedAnalysis);
        console.log('Current requiresManualTrigger:', requiresManualTrigger);
        
        // Only respond if this sidepanel is in the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTabId = tabs[0]?.id;
          if (typeof message.tabId === 'number' && activeTabId !== message.tabId) {
            console.log('Ignoring TAB_SWITCHED in inactive tab iframe');
            return;
          }
          
        // Only reload state if we're not viewing from recent
        if (!isViewingFromRecent) {
          console.log('[FNR] Immediately reloading state for reported tab to avoid stale UI');
          
          // 🚨🚨🚨 CRITICAL: Reset manual trigger flag when switching tabs (but not for history) 🚨🚨🚨
          console.log('🚨🚨🚨 [FNR] CHECKING IF SHOULD RESET MANUAL TRIGGER FLAG ON TAB SWITCH 🚨🚨🚨');
          console.log('🚨🚨🚨 Current isViewingFromRecent:', isViewingFromRecent, '🚨🚨🚨');
          
          // Only reset if we're not viewing from recent (history)
          if (!isViewingFromRecent) {
            console.log('🚨🚨🚨 [FNR] RESETTING MANUAL TRIGGER FLAG ON TAB SWITCH 🚨🚨🚨');
            setIsManualTrigger(false);
          } else {
            console.log('🚨🚨🚨 [FNR] NOT RESETTING MANUAL TRIGGER - VIEWING FROM HISTORY 🚨🚨🚨');
          }
          
          loadTabState(typeof message.tabId === 'number' ? message.tabId : undefined);
        } else {
          console.log('[FNR] Skipping tab state reload - viewing from recent analysis');
        }
        });
      }

      // Handle real-time provider updates
      if (message.type === 'PROVIDER_UPDATE') {
        console.log('[FNR] === PROVIDER_UPDATE MESSAGE ===');
        console.log('Provider:', message.provider);
        console.log('Status:', message.status);
        console.log('Current isViewingFromRecent:', isViewingFromRecent);
        console.log('Current hasExistingAnalysis:', hasExistingAnalysis);
        console.log('Current hasPreloadedAnalysis:', hasPreloadedAnalysis);
        console.log('Current requiresManualTrigger:', requiresManualTrigger);
        
        setProviderStatuses(prev => ({
          ...prev,
          [message.provider]: message.status
        }));
      }

      // Handle tab loading state updates
      if (message.type === 'TAB_LOADING_STATE') {
        console.log('[FNR] === TAB_LOADING_STATE MESSAGE ===');
        console.log('isLoading:', message.isLoading);
        console.log('Current isViewingFromRecent:', isViewingFromRecent);
        console.log('Current hasExistingAnalysis:', hasExistingAnalysis);
        console.log('Current hasPreloadedAnalysis:', hasPreloadedAnalysis);
        console.log('Current requiresManualTrigger:', requiresManualTrigger);
        
        // Only update loading state if we're not viewing from recent
        if (!isViewingFromRecent) {
          setIsPageLoading(message.isLoading);
          if (!message.isLoading) {
            // Page finished loading, get page info
            getPageInfo();
          }
        } else {
          console.log('[FNR] Skipping TAB_LOADING_STATE update - viewing from recent analysis');
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessages);

    // Listen for tab updates to detect loading state changes
    const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // Only care about the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id === tabId) {
          console.log('[FNR] === TAB_UPDATE DETECTED ===');
          console.log('Tab ID:', tabId);
          console.log('Status change:', changeInfo.status);
          console.log('Current isViewingFromRecent:', isViewingFromRecent);
          console.log('Current hasExistingAnalysis:', hasExistingAnalysis);
          console.log('Current hasPreloadedAnalysis:', hasPreloadedAnalysis);
          console.log('Current requiresManualTrigger:', requiresManualTrigger);
          
          // Only handle tab updates if we're not viewing from recent
          if (!isViewingFromRecent) {
            if (changeInfo.status === 'loading') {
              setIsPageLoading(true);
            } else if (changeInfo.status === 'complete') {
              setIsPageLoading(false);
              // Small delay to ensure page content is fully loaded
              setTimeout(() => {
                if (!pageInfo) {
                  getPageInfo();
                }
              }, 500);
            }
          } else {
            console.log('[FNR] Skipping tab update handling - viewing from recent analysis');
          }
        }
      });
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages);
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isViewingFromRecent, hasExistingAnalysis, hasPreloadedAnalysis, requiresManualTrigger]);

  // Listen for messages from injected header
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRIGGER_NEW_ANALYSIS') {
        console.log('🚨🚨🚨 [FNR] MANUAL TRIGGER DETECTED FROM EXTENSION ICON 🚨🚨🚨');
        setIsManualTrigger(true); // Mark as manual trigger
        setIsViewingFromSimilar(false); // Clear similar flag for manual trigger
        // Immediately show loading state for better UX
        setIsAnalyzing(true);
        setError('');
        setAnalysis([]);
        setFailedProviders([]);
        setShowButton(true);
        getPageInfo(true); // Manual trigger from extension icon
      } else if (event.data?.type === 'TRIGGER_RESET') {
        // Reset state and ensure we go to welcome page
        resetState();
        setSelectedPage('home');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadAnalysisForUrl = (url: string, timestamp?: number) => {
    console.log('=== LOAD_ANALYSIS_FOR_URL START ===');
    console.log('URL:', url);
    console.log('Timestamp:', timestamp);
    console.log('Current isViewingFromRecent:', isViewingFromRecent);
    
    // Check storage first to see if we have analysis data
    getStorage('recentAnalyses').then(recentAnalyses => {
      console.log('=== STORAGE CHECK ===');
      console.log('Recent analyses from storage:', recentAnalyses);
      
      // Find the specific analysis entry
      let analysisEntry = null;
      if (Array.isArray(recentAnalyses)) {
        if (timestamp) {
          // If timestamp is provided, find the exact analysis
          analysisEntry = recentAnalyses.find(entry => entry.url === url && entry.timestamp === timestamp);
        } else {
          // Fallback to first match if no timestamp
          analysisEntry = recentAnalyses.find(entry => entry.url === url);
        }
      }
      
      console.log('Found analysis entry for URL:', analysisEntry);
      
      if (analysisEntry && analysisEntry.fullAnalysis) {
        console.log('=== FULL ANALYSIS FOUND - CREATING NEW TAB WITH ANALYSIS ===');
        
        // Get current tab ID before creating new tab
        chrome.tabs.query({ active: true, currentWindow: true }, (currentTabs) => {
          const originalTabId = currentTabs[0]?.id;
          
          // Create new tab with the URL
          chrome.tabs.create({ url: url, active: true }, (newTab) => {
            console.log('Created new tab:', newTab.id, 'for URL:', url);
            
            // Wait for the new tab to load, then inject analysis
            setTimeout(() => {
              console.log('Injecting analysis into new tab...');
              console.log('Analysis data being sent:', {
                pageInfo: analysisEntry.pageInfo?.title,
                analysisLength: analysisEntry.fullAnalysis?.length,
                failedProviders: analysisEntry.failedProviders?.length
              });
              
              // Send message to background to handle analysis loading
              chrome.runtime.sendMessage({
                type: 'LOAD_ANALYSIS_IN_TAB',
                tabId: newTab.id,
                analysisData: {
                  pageInfo: analysisEntry.pageInfo,
                  analysis: analysisEntry.fullAnalysis,
                  failedProviders: analysisEntry.failedProviders || [],
                  isViewingFromRecent: true,
                  originalTabId: originalTabId
                }
              }, (response) => {
                console.log('LOAD_ANALYSIS_IN_TAB response:', response);
                if (!response?.success) {
                  console.error('Failed to load analysis in tab:', response?.error);
                }
              });
            }, 500); // Reduced delay for faster loading
          });
        });
        
        console.log('=== NEW TAB CREATED WITH ANALYSIS ===');
      } else {
        console.log('=== NO FULL ANALYSIS - OPENING IN NEW TAB ===');
        // No full analysis, just open in new tab
        chrome.tabs.create({ url: url, active: true });
        console.log('Opened URL in new tab for new analysis:', url);
      }
    }).catch(error => {
      console.error('Error checking storage:', error);
      // Fallback - open in new tab
      chrome.tabs.create({ url: url, active: true });
      console.log('Error fallback - opened URL in new tab:', url);
    });
  };

  const getPageInfo = (isManualTrigger = false) => {
    console.log('[FNR] === GET_PAGE_INFO CALLED ===');
    console.log('isManualTrigger:', isManualTrigger);
    console.log('isViewingFromRecent:', isViewingFromRecent);
    console.log('hasExistingAnalysis:', hasExistingAnalysis);
    console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
    
    // Don't get page info if we're viewing from recent analysis
    if (isViewingFromRecent) {
      console.log('[FNR] Skipping getPageInfo - viewing from recent analysis');
      return;
    }

    // Don't get page info if we already have existing analysis (unless manually triggered)
    if (hasExistingAnalysis && !isManualTrigger) {
      console.log('[FNR] Skipping getPageInfo - already have existing analysis');
      return;
    }

    // Don't get page info if we have preloaded analysis
    if (hasPreloadedAnalysis && !isManualTrigger) {
      console.log('[FNR] Skipping getPageInfo - have preloaded analysis');
      return;
    }

    // Don't get page info if this tab requires manual trigger (unless manually triggered)
    if (requiresManualTrigger && !isManualTrigger) {
      console.log('[FNR] Skipping getPageInfo - tab requires manual trigger');
      return;
    }

    console.log('[FNR] Proceeding with getPageInfo...');
    startTimer('getPageInfo-total');
    // Reset state
    setError('');
    setPageInfo(null);
    setAnalysis([]);
    setFailedProviders([]);
    setShowButton(true);
    // Set hasAttemptedAnalysis and persist it
    setHasAttemptedAnalysis(true);
    setStorage('hasAttemptedAnalysis', true);
    // We don't set isAnalyzing yet; will set when analyze starts
    setIsDetectingPage(false);
    setIsPageLoading(false); // Reset page loading state
    analysisTriggeredRef.current = false;

    startTimer('getPageInfo-tabs.query');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      endTimer('getPageInfo-tabs.query');
      const currentTab = tabs[0];
      if (!currentTab?.id) {
        setTimeout(() => {
          setIsDetectingPage(false);
          setError('No active tab found');
          endTimer('getPageInfo-total');
        }, 1000);
        return;
      }

      const startTime = Date.now();

      startTimer('getPageInfo-sendMessage');
      chrome.runtime.sendMessage({ 
        type: 'GET_PAGE_INFO',
        tabId: currentTab.id 
      }, (response) => {
        endTimer('getPageInfo-sendMessage');
        const elapsedTime = Date.now() - startTime;
        const remainingDelay = Math.max(0, 0 - elapsedTime);
        setTimeout(() => {
          setIsDetectingPage(false);
          if (!response?.success) {
            setError(response?.error || 'Failed to get page info');
            setIsAnalyzing(false);
            endTimer('getPageInfo-total');
            return;
          }
          if (!response.data) {
            setError('No page data received');
            setIsAnalyzing(false);
            endTimer('getPageInfo-total');
            return;
          }
          setPageInfo({
            title: response.data.title || 'No title found',
            content: response.data.content || 'No content found',
            url: response.data.url || 'No URL found',
            wordCount: response.data.wordCount || 0
          });
          endTimer('getPageInfo-total');
        }, remainingDelay);
      });
    });
  }

  const analyzeArticle = () => {
    console.log('🚨🚨🚨 [FNR] ANALYZE_ARTICLE FUNCTION CALLED 🚨🚨🚨');
    console.log('🚨🚨🚨 THIS WILL START A NEW ANALYSIS 🚨🚨🚨');
    console.log('[FNR] === ANALYZE_ARTICLE CALLED ===');
    console.log('isViewingFromRecent:', isViewingFromRecent);
    console.log('hasExistingAnalysis:', hasExistingAnalysis);
    console.log('isManualTrigger:', isManualTrigger);
    console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
    console.log('requiresManualTrigger:', requiresManualTrigger);

    // 🚨🚨🚨 CRITICAL: NEVER analyze unless extension icon was clicked 🚨🚨🚨
    if (!isManualTrigger) {
      console.log('🚨🚨🚨 [FNR] ANALYSIS BLOCKED: NO MANUAL TRIGGER (EXTENSION ICON NOT CLICKED) 🚨🚨🚨');
      console.log('🚨🚨🚨 ANALYSIS WILL NOT START - USER MUST CLICK EXTENSION ICON 🚨🚨🚨');
      return;
    }
    
    // Additional safeguard: prevent analysis if viewing from recent
    if (isViewingFromRecent) {
      console.log('🚨🚨🚨 [FNR] ANALYSIS BLOCKED: VIEWING FROM RECENT 🚨🚨🚨');
      console.log('🚨🚨🚨 ANALYSIS WILL NOT START 🚨🚨🚨');
      console.log('[FNR] Skipping analyzeArticle - viewing from recent analysis');
      return;
    }
    
    // Additional safeguard: prevent analysis if we have preloaded analysis
    if (hasPreloadedAnalysis) {
      console.log('🚨🚨🚨 [FNR] ANALYSIS BLOCKED: HAVE PRELOADED ANALYSIS 🚨🚨🚨');
      console.log('🚨🚨🚨 ANALYSIS WILL NOT START 🚨🚨🚨');
      console.log('[FNR] Skipping analyzeArticle - have preloaded analysis');
      return;
    }
    
    // Additional safeguard: prevent analysis if this tab requires manual trigger
    if (requiresManualTrigger && !isManualTrigger) {
      console.log('🚨🚨🚨 [FNR] ANALYSIS BLOCKED: REQUIRES MANUAL TRIGGER 🚨🚨🚨');
      console.log('🚨🚨🚨 ANALYSIS WILL NOT START 🚨🚨🚨');
      console.log('[FNR] Skipping analyzeArticle - tab requires manual trigger');
      return;
    }
    
    console.log('🚨🚨🚨 [FNR] ANALYSIS PROCEEDING: ALL SAFEGUARDS PASSED 🚨🚨🚨');
    console.log('🚨🚨🚨 NEW ANALYSIS WILL START 🚨🚨🚨');
    
    const rid = ++requestIdRef.current;
    startTimer(`analyze-${rid}-total`);
    if (!pageInfo) {
      setError('No page info found')
      endTimer(`analyze-${rid}-total`);
      return
    }
    
    // Get current tab ID first
    startTimer(`analyze-${rid}-tabs.query`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      endTimer(`analyze-${rid}-tabs.query`);
      const currentTab = tabs[0];
      if (!currentTab?.id) {
        setError('No active tab found');
        endTimer(`analyze-${rid}-total`);
        return;
      }

      setError('')
      setAnalysis([])
      setFailedProviders([])
      setSelectedProvider('')
      
      // Initialize provider statuses
      let providers;
      try {
        providers = JSON.parse(import.meta.env.VITE_AI_ROUTERS || '["Gemini"]');
      } catch (error) {
        console.warn('Failed to parse VITE_AI_ROUTERS, using fallback:', error);
        providers = ["Cohere", "Gemini"];
      }
      const initialStatuses: {[key: string]: 'waiting' | 'analyzing' | 'complete' | 'failed'} = {};
      providers.forEach((provider: string) => {
        initialStatuses[provider] = 'analyzing';
      });
      setProviderStatuses(initialStatuses);
      
      setIsAnalyzing(true);

      startTimer(`analyze-${rid}-sendMessage`);
      chrome.runtime.sendMessage({
        type: 'ANALYZE_ARTICLE',
        tabId: currentTab.id,
        content: buildAnalysisPrompt(pageInfo.url, pageInfo.title, pageInfo.content),
        providers: providers
      }, async (response) => {
        endTimer(`analyze-${rid}-sendMessage`);
        console.log('Raw API Response:', response);
        console.log('Response providers:', response?.providers);
        console.log('Response data:', response?.data);

        if (!response?.data) {
          console.error('Analysis failed - no response data received');
          setError('Failed to get analysis response');
          setIsAnalyzing(false);
          endTimer(`analyze-${rid}-total`);
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
          endTimer(`analyze-${rid}-total`);
          return;
        }

        try {
          // Parse and validate results
          startTimer(`analyze-${rid}-parseResults`);
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
                              impact: parsed.impact?.trim().replace(/['"]+/g, '').replace(/,\s*$/, '.') || ''
                            };
                          } catch (e: unknown) {
                            // Fallback for simpler format
                            const quoteMatch = obj.match(/quote["\s:]+([^,}]+)/);
                            const impactMatch = obj.match(/impact["\s:]+([^,}]+)/);
                            return {
                              quote: quoteMatch ? quoteMatch[1].trim().replace(/['"]+/g, '') : '',
                              impact: impactMatch ? impactMatch[1].trim().replace(/['"]+/g, '').replace(/,\s*$/, '.') : ''
                            };
                          }
                        }).filter((e: { quote: string; impact: string }) => e.quote && e.impact);
                      }
                      
                      parsedResult = {
                        credibility_score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                        credibility_summary: summaryMatch ? summaryMatch[1].trim().replace(/['"]+/g, '').replace(/,\s*$/, '.') : 'No summary provided',
                        reasoning: reasoningMatch ? reasoningMatch[1].trim().replace(/['"]+/g, '').replace(/,\s*$/, '.') : r.value,
                        evidence_sentences: evidenceSentences,
                        supporting_links: [] // Always start with empty array, will be filled by web search
                      };
                    }
                  } else {
                    parsedResult = r.value;
                  }

                  // Function to clean up text fields - ensure single period at end
                  const cleanupText = (text: string) => {
                    if (!text) return '';
                    // First remove any trailing whitespace, commas, or periods
                    let cleaned = text.trim().replace(/[,.\s]+$/, '');
                    // Then add exactly one period if it doesn't end with ! or ?
                    if (!cleaned.match(/[!?]$/)) {
                      cleaned += '.';
                    }
                    return cleaned;
                  };

                  // Clean up any trailing commas and fix periods in all text fields
                  if (parsedResult) {
                    // Additional cleanup for malformed text
                    const cleanMalformedText = (text: string) => {
                      if (!text) return '';
                      return text
                        .replace(/\\[A-Za-z][^\\]*\\/g, '') // Remove escaped sequences like \Get Up To 20 Free Meals\
                        .replace(/\\+/g, '') // Remove remaining backslashes
                        .replace(/\s+/g, ' ') // Normalize whitespace
                        .trim();
                    };
                    
                    parsedResult.credibility_summary = cleanupText(cleanMalformedText(parsedResult.credibility_summary));
                    parsedResult.reasoning = cleanupText(cleanMalformedText(parsedResult.reasoning));
                    if (parsedResult.evidence_sentences) {
                      parsedResult.evidence_sentences = parsedResult.evidence_sentences.map((evidence: any) => ({
                        quote: cleanMalformedText(evidence.quote?.trim() || ''),
                        impact: cleanupText(cleanMalformedText(evidence.impact))
                      }));
                    }
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
          endTimer(`analyze-${rid}-parseResults`);
          
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
            setHasAttemptedAnalysis(true);
            setHasExistingAnalysis(true); // Mark that we have existing analysis
            setStorage('hasAttemptedAnalysis', true);
            // Save a compact entry to recent analyses
            const averageScore = Math.round(validResults.reduce((sum, result) => sum + result.result.credibility_score, 0) / validResults.length);
            const top = validResults[0];
            try {
              console.log('=== SAVING ANALYSIS TO STORAGE ===');
              const existing = await getStorage('recentAnalyses');
              console.log('Existing analyses:', existing);
              
              const newEntry = {
                url: pageInfo.url,
                title: pageInfo.title,
                timestamp: Date.now(),
                score: averageScore,
                summary: top.result?.credibility_summary || undefined,
                // Save the full analysis data
                fullAnalysis: validResults,
                pageInfo: pageInfo,
                failedProviders: failedProviders
              };
              
              console.log('New entry to save:', {
                url: newEntry.url,
                title: newEntry.title,
                hasFullAnalysis: !!newEntry.fullAnalysis,
                fullAnalysisLength: newEntry.fullAnalysis?.length || 0,
                hasPageInfo: !!newEntry.pageInfo,
                hasFailedProviders: !!newEntry.failedProviders
              });
              
              const updated = [newEntry, ...existing].slice(0, 10);
              console.log('Updated analyses array length:', updated.length);
              
              await setStorage('recentAnalyses', updated);
              console.log('Analysis saved to storage successfully');
              
              // Trigger storage change listeners in iframe reliably
              try { 
                chrome.storage.local.set({ recentAnalyses: updated }); 
                console.log('Storage change triggered');
              } catch (e) {
                console.error('Error triggering storage change:', e);
              }
            } catch (error) {
              console.error('Error saving analysis to storage:', error);
            }
            // Show results immediately without waiting for web search
            setAnalysis(validResults);
            setShowButton(false);
            setIsAnalyzing(false);
            setHasAttemptedAnalysis(true); // Ensure this stays true
            endTimer(`analyze-${rid}-total`);

            // Perform web search in background and update sources when ready
            const searchTimeout = setTimeout(() => {
              console.log('Web search timed out');
            }, 8000);

            try {
              // Get current tab ID first before starting search
              chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                const currentTab = tabs[0];
                if (!currentTab?.id) {
                  console.error('No active tab found');
                  return;
                }

                // Use improved web search with multiple strategies
                const cleanQuery = (text: string) => {
                  return text
                    .replace(/['"]/g, '') // Remove quotes
                    .replace(/[^\w\s-]/g, ' ') // Replace special chars with space
                    .trim()
                    .split(/\s+/)
                    .filter(word => word.length > 2) // Remove very short words
                    .join(' ');
                };

                try {
                  console.log('=== AI-POWERED WEB SEARCH ===');
                  console.log('Original title:', pageInfo.title);
                  console.log('Sending title to AI for query generation...');
                  chrome.runtime.sendMessage({ 
                    type: 'WEB_SEARCH', 
                    query: pageInfo.title, // Send just the title, let AI generate the search query
                    originalUrl: pageInfo.url, // Send the original URL to extract year
                    max_results: 10,
                    tabId: currentTab.id
                  }, async (response) => {
                    console.log('Improved search response:', response);
                    if (!response?.success || !response?.data?.results) {
                      console.error('Improved search failed:', response);
                      return;
                    }
                    
                    clearTimeout(searchTimeout);

                    // Extract URLs from search results
                    const uniqueResults = response.data.results
                      .filter((r: any) => r?.url && r.url.startsWith('http'))
                      .map((r: any) => r.url)
                      .slice(0, 6); // Get top 6 results

                    if (uniqueResults.length > 0) {
                      const updatedResults = validResults.map(r => ({
                        ...r,
                        result: { ...r.result, supporting_links: uniqueResults }
                      }));
                      setAnalysis(updatedResults);
                    }
                    
                    // Update storage with the complete analysis including sources
                    try {
                      console.log('=== UPDATING STORAGE WITH SOURCES ===');
                      const existing = await getStorage('recentAnalyses');
                      const existingIndex = existing.findIndex((entry: any) => entry.url === pageInfo.url);
                      
                      if (existingIndex >= 0) {
                        // Update the existing entry with complete analysis including sources
                        const averageScore = Math.round(validResults.reduce((sum, result) => sum + result.result.credibility_score, 0) / validResults.length);
                        existing[existingIndex] = {
                          ...existing[existingIndex],
                          score: averageScore,
                          summary: validResults[0]?.result?.credibility_summary || existing[existingIndex].summary,
                          fullAnalysis: uniqueResults.length > 0 ? validResults.map(r => ({
                            ...r,
                            result: { ...r.result, supporting_links: uniqueResults }
                          })) : validResults,
                          timestamp: Date.now() // Update timestamp
                        };
                        
                        await setStorage('recentAnalyses', existing);
                        console.log('Updated analysis with sources in storage');
                      }
                    } catch (error) {
                      console.error('Error updating storage with sources:', error);
                    }

                    // Also update the tab state with the complete analysis including sources
                    try {
                      console.log('=== UPDATING TAB STATE WITH SOURCES ===');
                      console.log('Sources count per provider:');
                      validResults.forEach((result, idx) => {
                        console.log(`Provider ${idx} (${result.provider}): ${result.result.supporting_links?.length || 0} sources`);
                      });
                      
                      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const currentTab = tabs[0];
                        if (currentTab?.id) {
                          chrome.runtime.sendMessage({
                            type: 'SAVE_TAB_STATE',
                            tabId: currentTab.id,
                            data: {
                              pageInfo: pageInfo,
                              analysis: uniqueResults.length > 0 ? validResults.map(r => ({
                                ...r,
                                result: { ...r.result, supporting_links: uniqueResults }
                              })) : validResults,
                              failedProviders: failedProviders,
                              showButton: false,
                              isAnalyzing: false,
                              hasAttemptedAnalysis: true
                            }
                          }, (response) => {
                            if (response?.success) {
                              console.log('Tab state updated with sources successfully');
                            } else {
                              console.error('Failed to update tab state with sources:', response?.error);
                            }
                          });
                        }
                      });
                    } catch (error) {
                      console.error('Error updating tab state with sources:', error);
                    }
                  });
                } catch (error) {
                  console.error('Error during web search:', error);
                  
                  // Also update tab state even with error sources
                  try {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                      const currentTab = tabs[0];
                      if (currentTab?.id) {
                        chrome.runtime.sendMessage({
                          type: 'SAVE_TAB_STATE',
                          tabId: currentTab.id,
                          data: {
                            pageInfo: pageInfo,
                            analysis: validResults,
                            failedProviders: failedProviders,
                            showButton: false,
                            isAnalyzing: false,
                            hasAttemptedAnalysis: true
                          }
                        });
                      }
                    });
                  } catch (tabError) {
                    console.error('Error updating tab state after search error:', tabError);
                  }
                }
              });
            } catch (error) {
              console.error('Error initiating tab query:', error);
              
              // Update tab state even with error sources
              try {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const currentTab = tabs[0];
                  if (currentTab?.id) {
                    chrome.runtime.sendMessage({
                      type: 'SAVE_TAB_STATE',
                      tabId: currentTab.id,
                      data: {
                        pageInfo: pageInfo,
                        analysis: validResults,
                        failedProviders: failedProviders,
                        showButton: false,
                        isAnalyzing: false,
                        hasAttemptedAnalysis: true
                      }
                    });
                  }
                });
              } catch (tabError) {
                console.error('Error updating tab state after tab query error:', tabError);
              }
            }
          } else {
            setError('Failed to parse analysis results. Please try again.');
            setTimeout(() => {
              setIsAnalyzing(false);
              setHasAttemptedAnalysis(true); // Ensure this stays true
            }, 1500);
          }
        } catch (e) {
          console.error('Error processing analysis results:', e);
          setError('An error occurred while processing the results.');
          setTimeout(() => {
            setIsAnalyzing(false);
            setHasAttemptedAnalysis(true); // Ensure this stays true
          }, 1500);
        }
        
      });
    });
  }

  if (!uiReady) {
    return <div className={styles.container}><div className={styles.loading}>Loading…</div></div>;
  }

  return (
    <div className={`${styles.container}`}>
      {selectedPage === 'home' && (
        <>
          {isPageLoading && (
            <div className={styles.analysisLoadingState}>
              <div className={styles.analysisLoadingContent}>
                <h2 className={styles.analysisLoadingTitle}>
                  {'Page Loading'}
                </h2>
                <p className={styles.analysisLoadingSubtitle}>
                  {'Please wait while the page finishes loading'}
                </p>
                <div className={styles.modernSpinner}>
                  <div className={styles.spinnerRing}></div>
                  <div className={styles.spinnerRing}></div>
                  <div className={styles.spinnerRing}></div>
                </div>
              </div>
            </div>
          )}

          {isAnalyzing && !isPageLoading && (
            <div className={styles.analysisLoadingState}>
              <div className={styles.analysisLoadingContent}>
                <h2 className={styles.analysisLoadingTitle}>
                  {'Analyzing Article'}
                </h2>
                <p className={styles.analysisLoadingSubtitle}>
                  {'Please wait while we evaluate the credibility of this content'}
                </p>
                <div className={styles.modernSpinner}>
                  <div className={styles.spinnerRing}></div>
                  <div className={styles.spinnerRing}></div>
                  <div className={styles.spinnerRing}></div>
                </div>
              </div>
            </div>
          )}

          {!isPageLoading && !isAnalyzing && (
            <div className={styles.content}>
              {analysis.length > 0 ? (
                    <AnalysisResults 
                      analysis={analysis}
                      selectedProvider={selectedProvider}
                      onProviderSelect={setSelectedProvider}
                      onNewAnalysis={() => { 
                        console.log('=== DONE BUTTON HANDLER ===');
                        console.log('isViewingFromRecent:', isViewingFromRecent);
                        console.log('originalTabId:', originalTabId);
                        console.log('hasExistingAnalysis:', hasExistingAnalysis);
                        console.log('hasPreloadedAnalysis:', hasPreloadedAnalysis);
                        console.log('requiresManualTrigger:', requiresManualTrigger);
                        
                        if (isViewingFromRecent) {
                          console.log('Handling close tab for recent analysis');
                          // Close the current tab and switch back to original tab if viewing from recent analysis
                          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            const currentTab = tabs[0];
                            console.log('Current tab:', currentTab?.id);
                            if (currentTab?.id) {
                              // If we have an original tab ID, switch to it first, then close current tab
                              if (originalTabId) {
                                console.log('Switching to original tab:', originalTabId);
                                chrome.tabs.update(originalTabId, { active: true }, () => {
                                  console.log('Switched to original tab, now closing analysis tab:', currentTab.id);
                                  // Close the analysis tab after switching
                                  if (currentTab.id) {
                                    chrome.tabs.remove(currentTab.id);
                                  }
                                });
                              } else {
                                console.log('No original tab ID, just closing current tab');
                                // Fallback: just close the current tab
                                chrome.tabs.remove(currentTab.id);
                              }
                            }
                          });
                        } else {
                          console.log('Resetting state and closing injected sidebar');
                          // Reset internal/background state
                          resetState();
                          // Ask content script to remove the injected sidebar (same behavior as the X button)
                          try {
                            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                              const activeTab = tabs[0];
                              if (activeTab?.id) {
                                console.log('🔥🔥🔥 SIDEBAR OPENER #4: CLOSE BUTTON CLICKED (NOT OPENING BUT CLOSING) 🔥🔥🔥');
                                chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_INJECTED_SIDEBAR', keepOpen: false });
                              }
                            });
                          } catch (e) {
                            console.warn('Failed to send close message to content script', e);
                          }
                        }
                      }}
                      isViewingFromRecent={isViewingFromRecent}
                      onLoadAnalysisForUrl={loadAnalysisForUrl}
                    />
                  ) : error ? (
            <div className={styles.analysisErrorState}>
              <div className={styles.analysisErrorContent}>
                <h2 className={styles.analysisErrorTitle}>
                  Error
                </h2>
                <p className={styles.analysisErrorSubtitle}>
                  {error || "Unable to analyze this page"}
                </p>
                <p className={styles.analysisErrorSubtitle}>
                  Please try again
                </p>
                <button className={styles.errorActionButton} onClick={() => {
                  console.log('[FNR] === ERROR ACTION BUTTON CLICKED ===');
                  console.log('Current isViewingFromRecent:', isViewingFromRecent);
                  console.log('Current hasExistingAnalysis:', hasExistingAnalysis);
                  console.log('Current hasPreloadedAnalysis:', hasPreloadedAnalysis);
                  console.log('Current requiresManualTrigger:', requiresManualTrigger);
                  
                  // Only retry if we're not viewing from recent
                  if (!isViewingFromRecent) {
                    console.log('[FNR] Retrying analysis...');
                    getPageInfo();
                  } else {
                    console.log('[FNR] Skipping retry - viewing from recent analysis');
                  }
                }}>
                  Try Again
                </button>
              </div>
            </div>
              ) : null}
            </div>
          )}
          {/* No manual analyze button; analysis auto-starts */}
        </>
      )}

      {selectedPage === 'settings' && null}
    </div>
  );
}

export default App; 