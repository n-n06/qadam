import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Load data on mount / when deps change.
 * `poll`: optional predicate (data) => boolean; while it returns true the data is refetched every 2 s.
 */
export function useLoad(fn, deps = [], poll) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  const pollRef = useRef(poll);
  const dataRef = useRef(null);
  fnRef.current = fn;
  pollRef.current = poll;

  const load = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      dataRef.current = data;
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);

  useEffect(() => {
    if (!poll) return undefined;
    const t = setInterval(() => {
      if (pollRef.current?.(dataRef.current)) load(true);
    }, 2000);
    return () => clearInterval(t);
  }, [Boolean(poll), load]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload: load };
}
