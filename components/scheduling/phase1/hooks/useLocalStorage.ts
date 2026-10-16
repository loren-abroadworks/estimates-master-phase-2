import { useCallback, useState } from 'react';

/** Persist a small UI preference under `key`. Reads once on mount (tolerating
 *  malformed JSON), writes through on every set. Not reactive across tabs — the
 *  app has a single window. */
export function useLocalStorage<T>(key: string, initial: T): readonly [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback((next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode / quota) — keep the in-memory value.
    }
  }, [key]);

  return [value, set] as const;
}
