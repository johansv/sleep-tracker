import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Minimal in-memory data loading for this app. Results are kept only for the lifetime of the
 * page so screens can revalidate without flashing; nothing is persisted for offline use.
 * If revalidation fails, the error replaces the data so stale values never look current.
 */

type Listener = () => void;

let generation = 0;
const listeners = new Set<Listener>();
const cache = new Map<string, unknown>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mark every loaded resource stale (after a mutation, reconnect, or app refocus). */
export function invalidateAll(): void {
  generation += 1;
  for (const listener of listeners) listener();
}

export type QueryState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined; refreshing: boolean }
  | { status: 'error'; data?: undefined; error: Error };

function initial<T>(key: string | null): QueryState<T> {
  return key !== null && cache.has(key)
    ? { status: 'success', data: cache.get(key) as T, refreshing: true }
    : { status: 'loading' };
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> & { retry: () => void } {
  const gen = useSyncExternalStore(subscribe, () => generation);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const [attempt, setAttempt] = useState(0);
  const [entry, setEntry] = useState<{ key: string | null; state: QueryState<T> }>(() => ({
    key,
    state: initial(key),
  }));

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        cache.set(key, data);
        if (!cancelled) setEntry({ key, state: { status: 'success', data, refreshing: false } });
      },
      (error: unknown) => {
        cache.delete(key);
        if (!cancelled) {
          setEntry({
            key,
            state: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, gen, attempt]);

  const retry = useCallback(() => {
    setEntry({ key, state: { status: 'loading' } });
    setAttempt((a) => a + 1);
  }, [key]);

  // A different key than the stored result: never show another resource's data.
  const state = entry.key === key ? entry.state : initial<T>(key);
  return { ...state, retry };
}
