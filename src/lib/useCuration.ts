import { useEffect, useMemo, useState } from 'react';
import { mockCuration } from '../demo/demoResult';
import type { CurationResult, SearchQuery } from '../shared/types';
import { ApiError, curateRoutes } from './api';
import { useSearch } from './SearchContext';

/**
 * Runs AI curation for a query. In demo mode it returns the fixed sample instantly and makes no
 * network calls. A null query (invalid URL) does nothing.
 */
export function useCuration(query: SearchQuery | null, opts: { demo?: boolean } = {}) {
  const { weeks } = useSearch();
  const demo = !!opts.demo;
  const [data, setData] = useState<CurationResult | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const demoData = useMemo(() => (demo && query ? mockCuration(query, weeks) : null), [demo, query, weeks]);

  useEffect(() => {
    if (demo || !query) return;
    let live = true;
    setData(null);
    setError(null);
    curateRoutes(query)
      .then((r) => live && setData(r))
      .catch((e: Error) => live && setError(e));
    return () => {
      live = false;
    };
    // The query object is rebuilt on every parse; its URL form is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, query && JSON.stringify([query.from.code, query.to.code, query.departWeek.start, query.returnWeek?.start, query.stay, query.priority, query.travelers, query.cabin])]);

  const result = demo ? demoData : data;
  return { data: result, error: demo ? null : error, loading: !!query && !result && !error };
}
