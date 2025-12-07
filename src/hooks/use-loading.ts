/**
 * Loading State Hooks
 * Utility hooks for managing loading states
 */

import { useState, useCallback } from "react";

/**
 * Simple loading state hook
 */
export function useLoading(initialState = false) {
  const [isLoading, setIsLoading] = useState(initialState);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);
  const toggleLoading = useCallback(() => setIsLoading((prev) => !prev), []);

  return {
    isLoading,
    startLoading,
    stopLoading,
    toggleLoading,
    setIsLoading,
  };
}

/**
 * Async operation wrapper with loading state
 */
export function useAsyncLoading<T extends (...args: any[]) => Promise<any>>(
  asyncFn: T
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await asyncFn(...args);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn]
  );

  return {
    execute,
    isLoading,
    error,
  };
}

/**
 * Multiple loading states manager
 * Useful for tracking multiple async operations
 */
export function useMultipleLoading() {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

  const startLoading = useCallback((key: string) => {
    setLoadingStates((prev) => ({ ...prev, [key]: true }));
  }, []);

  const stopLoading = useCallback((key: string) => {
    setLoadingStates((prev) => ({ ...prev, [key]: false }));
  }, []);

  const isLoading = useCallback(
    (key: string) => loadingStates[key] ?? false,
    [loadingStates]
  );

  const isAnyLoading = useCallback(
    () => Object.values(loadingStates).some((loading) => loading),
    [loadingStates]
  );

  return {
    startLoading,
    stopLoading,
    isLoading,
    isAnyLoading,
    loadingStates,
  };
}

/**
 * Loading state with minimum duration
 * Prevents flash of loading state
 */
export function useMinimumLoading(minimumMs = 500) {
  const [isLoading, setIsLoading] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setStartTime(Date.now());
  }, []);

  const stopLoading = useCallback(() => {
    if (startTime) {
      const elapsed = Date.now() - startTime;
      const remaining = minimumMs - elapsed;

      if (remaining > 0) {
        setTimeout(() => {
          setIsLoading(false);
          setStartTime(null);
        }, remaining);
      } else {
        setIsLoading(false);
        setStartTime(null);
      }
    } else {
      setIsLoading(false);
    }
  }, [startTime, minimumMs]);

  return {
    isLoading,
    startLoading,
    stopLoading,
  };
}
