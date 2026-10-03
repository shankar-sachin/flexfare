import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DepthChoice } from '../components/DepthChoice';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { ArrowRight } from '../components/Icons';
import { SearchPanel } from '../components/SearchPanel';
import { getMe, useQuota, weekFares } from '../lib/api';
import { legQueries, legsProblem } from '../lib/legs';
import { toSearchParams } from '../lib/queryUrl';
import { useSearch } from '../lib/SearchContext';
import type { WeekFare } from '../shared/types';

export function SearchPage() {
  const { weeks, query, setQuery } = useSearch();
  const navigate = useNavigate();
  const quota = useQuota();
  const [fares, setFares] = useState<WeekFare[]>([]);
  const [faresLoading, setFaresLoading] = useState(false);

  useEffect(() => {
    if (!quota) getMe().catch(() => undefined);
  }, [quota]);

  // "from $X" bars for the chosen city pair. Fails quietly: the picker still works without them.
  useEffect(() => {
    let live = true;
    setFares([]);
    if (query.from.code !== query.to.code) {
      setFaresLoading(true);
      weekFares(query.from.code, query.to.code)
        .then((f) => live && setFares(f))
        .catch(() => undefined)
        .finally(() => live && setFaresLoading(false));
    }
    return () => {
      live = false;
    };
  }, [query.from.code, query.to.code]);

  const left = (d: 'regular' | 'deep') => (quota ? Math.max(0, quota[d].limit - quota[d].used) : null);
  const multi = query.trip === 'multi';
  const needed = multi ? legQueries(query).length : 1; // a multi-city trip uses one regular search per flight
  const kind = multi ? 'regular' : query.depth;
  const leftNow = left(kind);
  const problem = legsProblem(query) ?? (query.trip === 'round' && !query.returnWeek ? 'Pick a return week.' : null);
  const short = leftNow !== null && leftNow < needed;
  const blocked = short || problem !== null;
  const go = () => navigate(`/results?${toSearchParams(query)}`);
  const noun = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 'es'}`.replace('searchs', 'searches');

  return (
    <>
      <Header />
      <Hero kicker="city to city · week to week · ranked by ai" />
      <main className="container stack" style={{ marginTop: -100, paddingBottom: 80, gap: 64 }}>
        <SearchPanel
          query={query}
          weeks={weeks}
          fares={fares}
          faresLoading={faresLoading}
          onChange={setQuery}
          footer={
            <div className="stack" style={{ gap: 12, alignItems: 'flex-end' }}>
              {!multi && <DepthChoice value={query.depth} onChange={(depth) => setQuery({ depth })} quota={quota} />}
              <button type="button" className="btn btn--signal btn--lg" disabled={blocked} onClick={go}>
                {multi ? 'Search these flights' : query.depth === 'deep' ? 'Run deep search' : 'Curate my routes'} <ArrowRight />
              </button>
              <span className="muted" style={{ fontSize: 14, textAlign: 'right' }} aria-live="polite">
                {problem
                  ? problem
                  : leftNow === null
                    ? ' '
                    : short
                      ? leftNow === 0
                        ? `No ${kind === 'deep' ? 'deep searches' : 'regular searches'} left today. They reset at 00:00 UTC.`
                        : `This trip needs ${noun(needed, 'search')} (one per flight) and you have ${leftNow} left today. Remove a flight to continue.`
                      : multi
                        ? `Uses ${noun(needed, 'regular search')} (one per flight) of your ${leftNow} left today. Repeat searches are free.`
                        : `Uses 1 of your ${leftNow} ${kind} ${leftNow === 1 ? 'search' : 'searches'} left today. Repeat searches are free.`}
              </span>
            </div>
          }
        />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
