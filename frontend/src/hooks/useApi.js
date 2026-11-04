import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/axiosInstance';
import { useSalesIdStore } from '../store/salesIdStore';

/** Loads data and reloads when deps or the selected Sales ID change. */
export function useApi(loader, deps = [], { skip = false } = {}) {
  const version = useSalesIdStore((s) => s.version);
  const [state, setState] = useState({ data: null, meta: null, loading: !skip, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (skip) return;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loader();
      if (mine === seq.current) setState({ data: res.data.data, meta: res.data.meta ?? null, loading: false, error: null });
    } catch (err) {
      if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, skip]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounce(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Wraps an async action with busy state + toast-friendly error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
