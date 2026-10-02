import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SearchQuery } from '../shared/types';
import { searchCities } from './api';
import { parseSearchParams } from './queryUrl';
import { useSearch } from './SearchContext';

/**
 * The search a results/route page is showing, read from the URL so links are shareable.
 * Unknown city codes (a link opened cold) show as their code first, then get real names.
 */
export function useUrlQuery(): { query: SearchQuery | null; params: URLSearchParams } {
  const [params] = useSearchParams();
  const { lookupCity, rememberCity } = useSearch();
  const [version, setVersion] = useState(0);

  const query = useMemo(
    () =>
      parseSearchParams(params, (code) => lookupCity(code) ?? (/^[A-Z]{3}$/.test(code) ? { code, name: code, airports: [code] } : undefined)),
    // `version` re-parses once a stub city has been replaced with the real one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, lookupCity, version],
  );

  useEffect(() => {
    if (!query) return;
    const stubs = [query.from, query.to].filter((c) => c.name === c.code);
    if (stubs.length === 0) return;
    let live = true;
    Promise.all(
      stubs.map((s) =>
        searchCities(s.code).then((list) => {
          const hit = list.find((c) => c.code === s.code);
          if (hit) rememberCity(hit);
        }),
      ),
    )
      .then(() => live && setVersion((v) => v + 1))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [query, rememberCity]);

  return { query, params };
}
