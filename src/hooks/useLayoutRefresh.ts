import { useEffect, useCallback } from 'react';

/**
 * Hook to handle layout refresh when tab visibility changes
 * This fixes the "mushed up" UI issue when switching tabs during analysis
 */
export function useLayoutRefresh() {
  const forceLayoutRefresh = useCallback(() => {
    // Force browser to recalculate layouts
    document.body.style.display = 'none';
    document.body.offsetHeight; // Trigger reflow
    document.body.style.display = '';
    
    // Also trigger a resize event to make sure all components respond
    window.dispatchEvent(new Event('resize'));
  }, []);

  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden) {
      // Tab became visible - refresh layout after a short delay
      setTimeout(() => {
        forceLayoutRefresh();
      }, 100);
    }
  }, [forceLayoutRefresh]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  return { forceLayoutRefresh };
}

