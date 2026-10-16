import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data, then keeps it fresh: re-fetches every `intervalMs` and whenever the tab regains
 * focus, so a slot someone else just booked shows as taken without a manual reload.
 * `load` must be a stable function (e.g. one of the `api.*` functions).
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs = 15_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [load]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh, setData };
}
