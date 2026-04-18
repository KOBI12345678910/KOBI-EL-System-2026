import { useState, useEffect, useCallback } from "react";
import { authFetch, NetworkTimeoutError } from "@/lib/utils";

interface UseTimedFetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Fetches data via authFetch (which has a built-in 15s timeout) and manages
 * loading/error/data state. Call retry() to re-fetch.
 *
 * NOTE: `options` is captured only on initial render and on retry.
 * If options change between renders, the fetch will NOT automatically re-run.
 * Pass a stable (memoized) options object to avoid stale closures.
 */
export function useTimedFetch<T = unknown>(
  url: string | null,
  options?: RequestInit
): UseTimedFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let cancelled = false;

    authFetch(url, options)
      .then(async res => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "שגיאת שרת" }));
          throw new Error(body.error || `שגיאה ${res.status}`);
        }
        const json: T = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (cancelled) return;
        const isTimeout = err instanceof NetworkTimeoutError ||
          (err instanceof DOMException && err.name === "AbortError");
        const finalErr: Error = isTimeout ? new NetworkTimeoutError() : err;
        setError(finalErr);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, retryCount]);

  return { data, loading, error, retry };
}
