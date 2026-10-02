import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { ArrowRight } from '../components/Icons';
import { SearchPanel } from '../components/SearchPanel';
import { getMe, useQuota, weekFares } from '../lib/api';
import { toSearchParams } from '../lib/queryUrl';
import { useSearch } from '../lib/SearchContext';
import type { WeekFare } from '../shared/types';

export function SearchPage() {
  const { weeks, query, setQuery } = useSearch();
  const navigate = useNavigate();
  const quota = useQuota();
  const [fares, setFares] = useState<WeekFare[]>([]);

  useEffect(() => {
    if (!quota) getMe().catch(() => undefined);
  }, [quota]);

  // "from $X" bars for the chosen city pair. Fails quietly: the picker still works without them.
  useEffect(() => {
    let live = true;
    setFares([]);
    if (query.from.code !== query.to.code) {
      weekFares(query.from.code, query.to.code).then((f) => live && setFares(f)).catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [query.from.code, query.to.code]);

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  const sameCity = query.from.code === query.to.code;
  const blocked = left === 0 || sameCity;
  const go = () => navigate(`/results?${toSearchParams(query)}`);

  return (
    <>
      <Header />
      <Hero kicker="city to city · week to week · ranked by ai" />
      <main className="container stack" style={{ marginTop: -100, paddingBottom: 80, gap: 64 }}>
        <SearchPanel
          query={query}
          weeks={weeks}
          fares={fares}
          onChange={setQuery}
          footer={
            <div className="stack" style={{ gap: 8, alignItems: 'flex-end' }}>
              <button type="button" className="btn btn--signal btn--lg" disabled={blocked} onClick={go}>
                Curate my routes <ArrowRight />
              </button>
              <span className="muted" style={{ fontSize: 14 }} aria-live="polite">
                {sameCity
                  ? 'Pick two different cities.'
                  : left === null
                    ? ' '
                    : left === 0
                      ? 'No searches left today. They reset at 00:00 UTC.'
                      : `Uses 1 of your ${left} remaining ${left === 1 ? 'search' : 'searches'} today. Repeat searches are free.`}
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
