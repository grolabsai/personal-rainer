import { useCallback, useEffect, useState } from 'react';

// Loading, loaded and failed are three different screens; this keeps them apart.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: undefined }));
    run().then(data => setState({ data, loading: false }), error => setState({ error, loading: false }));
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
