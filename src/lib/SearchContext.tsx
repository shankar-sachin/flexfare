import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { City, SearchQuery } from '../shared/types';
import { upcomingWeeks } from '../shared/weeks';
import { POPULAR_CITIES } from './popularCities';

interface SearchState {
  weeks: ReturnType<typeof upcomingWeeks>;
  /** The form state on the search page. Results read their query from the URL instead. */
  query: SearchQuery;
  setQuery: (patch: Partial<SearchQuery>) => void;
  /** Cities we have names/airports for, keyed by IATA city code. */
  lookupCity: (code: string) => City | undefined;
  rememberCity: (city: City) => void;
}

const Ctx = createContext<SearchState | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const weeks = useMemo(() => upcomingWeeks(12), []);
  const cities = useRef(new Map(POPULAR_CITIES.map((c) => [c.code, c])));
  const [query, setQueryState] = useState<SearchQuery>(() => ({
    trip: 'round',
    extraLegs: [],
    from: cities.current.get('SFO')!,
    to: cities.current.get('LIS')!,
    departWeek: weeks[2],
    returnWeek: weeks[4],
    travelers: 1,
    cabin: 'economy',
    stay: 'range',
    priority: 'balance',
    depth: 'regular',
  }));
  const setQuery = useCallback((patch: Partial<SearchQuery>) => setQueryState((q) => ({ ...q, ...patch })), []);
  const rememberCity = useCallback((c: City) => void cities.current.set(c.code, c), []);
  const lookupCity = useCallback((code: string) => cities.current.get(code), []);

  const value = useMemo(() => ({ weeks, query, setQuery, lookupCity, rememberCity }), [weeks, query, setQuery, lookupCity, rememberCity]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearch() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSearch must be used inside <SearchProvider>');
  return v;
}
