import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { demoQuery } from '../demo/demoResult';
import { Header } from '../components/Header';
import { ArrowRight, Sparkle } from '../components/Icons';
import { RouteCard } from '../components/RouteCard';
import { WeekFareChart } from '../components/WeekFareChart';
import { ApiError } from '../lib/api';
import { useSearch } from '../lib/SearchContext';
import { useCuration } from '../lib/useCuration';
import { useUrlQuery } from '../lib/useUrlQuery';

type Sort = 'fit' | 'price' | 'speed';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'fit', label: 'Best fit' },
  { value: 'price', label: 'Cheapest' },
  { value: 'speed', label: 'Fastest' },
];
const PRIORITY_LABEL = { price: 'Lowest price', balance: 'Best balance', speed: 'Shortest trip' };

/** 8 weeks starting just before the departure week, so the user's weeks are in view. */
function chartWindow<T extends { isoWeek: number }>(fares: T[], departIso: number): T[] {
  const start = Math.min(Math.max(0, fares.findIndex((f) => f.isoWeek === departIso) - 2), Math.max(0, fares.length - 8));
  return fares.slice(start, start + 8);
}

function Loading({ airports }: { airports: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep(1), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="muted" role="status" aria-live="polite" style={{ fontSize: 16 }}>
      {step === 0 ? `Checking date pairs across ${airports}…` : 'Ranking the best options with AI…'}
    </p>
  );
}

function ErrorBox({ error, regularHref }: { error: Error; regularHref: string }) {
  const api = error instanceof ApiError ? error : null;
  const resets = api?.code === 'QUOTA_EXCEEDED' || api?.code === 'DEEP_QUOTA_EXCEEDED' || api?.code === 'BUSY' ? String(api.extra.resetsAt ?? '') : '';
  const when = resets ? new Date(resets).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <div role="alert" className="form-error stack" style={{ gap: 10 }}>
      <strong>{api?.code === 'QUOTA_EXCEEDED' ? 'No searches left today' : api?.code === 'DEEP_QUOTA_EXCEEDED' ? 'Deep search used for today' : 'Couldn\'t curate routes'}</strong>
      <span>
        {error.message}
        {when && ` They reset at ${when} your time.`}
        {api?.code === 'QUOTA_EXCEEDED' && ' Searches you ran in the last 6 hours reopen for free from your account.'}
      </span>
      <div className="row" style={{ gap: 12 }}>
        {api?.code === 'QUOTA_EXCEEDED' && <Link to="/account" className="btn btn--ink">Open my recent searches</Link>}
        {api?.code === 'DEEP_QUOTA_EXCEEDED' && <Link to={regularHref} className="btn btn--ink">Run it as a regular search</Link>}
        {api?.code !== 'QUOTA_EXCEEDED' && api?.code !== 'DEEP_QUOTA_EXCEEDED' && <button type="button" className="btn btn--ink" onClick={() => window.location.reload()}>Try again</button>}
      </div>
    </div>
  );
}

export function ResultsPage({ demo = false }: { demo?: boolean }) {
  const { weeks, setQuery } = useSearch();
  const url = useUrlQuery();
  const query = demo ? demoQuery(weeks) : url.query;
  const { data, loading, error } = useCuration(query, { demo });
  const [sort, setSort] = useState<Sort>('fit');
  const [copied, setCopied] = useState(false);

  // Keep the search form in step with what you're looking at, so "Edit search" opens the same search.
  useEffect(() => {
    if (!demo && query) setQuery(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, query?.from.code, query?.to.code, query?.departWeek.start, query?.returnWeek?.start]);

  // Top picks (written up by the AI) first, then "More options" (ranked by score). Sorting applies within each group.
  const { picks, more } = useMemo(() => {
    const sorted = (list: NonNullable<typeof data>['routes']) => {
      const r = [...list];
      if (sort === 'fit') r.sort((a, b) => b.fit - a.fit);
      if (sort === 'price') r.sort((a, b) => a.price - b.price);
      if (sort === 'speed') r.sort((a, b) => a.totalMinutes - b.totalMinutes);
      return r;
    };
    const all = data?.routes ?? [];
    return { picks: sorted(all.filter((r) => r.tier !== 'more')), more: sorted(all.filter((r) => r.tier === 'more')) };
  }, [data, sort]);
  const routes = [...picks, ...more];

  if (!query) {
    return (
      <>
        <Header />
        <main className="container stack" style={{ paddingBlock: 40, gap: 12 }}>
          <h1>That search link isn't valid</h1>
          <p className="muted">It may be missing a city or week, or the weeks may have passed.</p>
          <Link to="/search">Start a new search</Link>
        </main>
      </>
    );
  }

  const routeTo = (id: string) => (demo ? `/demo/route/${id}` : `/route/${id}?${url.params}`);
  const highlight = [query.departWeek.isoWeek, query.returnWeek?.isoWeek].filter((n): n is number => n !== undefined);
  const airports = `${query.from.airports.join(', ')} → ${query.to.airports.join(', ')}`;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the address bar still has the link */
    }
  };

  return (
    <>
      <Header>
        <div style={{ borderTop: '1px solid var(--on-dark-line)' }}>
          <div className="container row" style={{ gap: '12px 28px', paddingBlock: 16 }}>
            <span className="row" style={{ gap: 10, fontSize: 20, fontWeight: 800, fontStretch: '110%' }}>
              {query.from.name} <ArrowRight color="var(--signal)" /> {query.to.name}
            </span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--on-dark-muted)' }}>
              WK {query.departWeek.isoWeek} {query.departWeek.label}
              {query.returnWeek && `  →  WK ${query.returnWeek.isoWeek} ${query.returnWeek.label}`}
            </span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--on-dark-muted)' }}>
              {query.travelers} {query.travelers === 1 ? 'adult' : 'adults'} · <span style={{ textTransform: 'capitalize' }}>{query.cabin}</span> · {PRIORITY_LABEL[query.priority]}
            </span>
            <Link to={demo ? '/signup' : '/search'} style={{ marginLeft: 'auto', color: 'var(--signal)', fontWeight: 600 }}>
              {demo ? 'Sign up to search your own' : 'Edit search'}
            </Link>
          </div>
        </div>
      </Header>

      {demo && (
        <div style={{ background: 'var(--signal)', color: 'var(--ink)' }}>
          <div className="container row" style={{ justifyContent: 'space-between', gap: 12, paddingBlock: 12 }}>
            <span><strong>Sample search.</strong> These routes and prices are made up to show you how flexfare works.</span>
            <Link to="/signup" style={{ color: 'var(--ink)', fontWeight: 700 }}>Sign up free to pick your own weeks</Link>
          </div>
        </div>
      )}

      <main className="container stack" style={{ paddingBlock: '40px 80px', gap: 32 }}>
        {error && <ErrorBox error={error} regularHref={`/results?${new URLSearchParams([...url.params.entries()].map(([k, v]) => [k, k === 'depth' ? 'regular' : v]))}`} />}
        {data?.sample && !demo && <p className="form-ok" role="note"><strong>Sample data.</strong> These fares are simulated for development, not real prices.</p>}
        {data?.aiFallback && <p className="form-ok" role="note">AI summary unavailable right now. Routes are ranked by a score that weighs price, travel time, layovers and stay length.</p>}
        {data?.dataNote && <p className="form-ok" role="note">{data.dataNote}</p>}

        <section aria-label="AI summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
          {loading || !data ? (
            !error && (
              <>
                <div className="skeleton" style={{ height: 300 }} aria-label="Curating routes" />
                <div className="skeleton" style={{ height: 300 }} />
              </>
            )
          ) : (
            <>
              <div className="card card--dark stack" style={{ borderRadius: 'var(--r-xl)', padding: 28, gap: 16 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--signal)', color: 'var(--ink)' }}>
                    <Sparkle />
                  </span>
                  <span className="mono" style={{ fontSize: 14, color: 'var(--signal)' }}>the short version</span>
                  {data.depth === 'deep' && <span className="tag">Deep search</span>}
                </div>
                <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 900, fontStretch: '115%', letterSpacing: '-0.02em' }}>{data.headline}</h1>
                <p style={{ color: 'var(--on-dark-muted)' }}>{data.summary}</p>
              </div>
              {data.weekFares.length > 0 && (
                <div className="card stack" style={{ borderRadius: 'var(--r-xl)', padding: 28, gap: 18 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>Lowest fare seen by departure week</h2>
                    <span className="muted" style={{ fontSize: 14 }}>Your weeks in yellow</span>
                  </div>
                  <WeekFareChart fares={chartWindow(data.weekFares, query.departWeek.isoWeek)} highlight={highlight} />
                </div>
              )}
            </>
          )}
        </section>
        {loading && <Loading airports={airports} />}

        <section aria-labelledby="routes-h" className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 16 }}>
            <h2 id="routes-h" style={{ fontSize: 28, fontWeight: 900, fontStretch: '112%' }}>
              {data ? (picks.length ? `${picks.length} top ${picks.length === 1 ? 'pick' : 'picks'}` : 'No routes found') : error ? 'No routes' : 'Curating…'}
            </h2>
            {picks.length > 1 && (
              <div role="group" aria-label="Sort routes" className="segmented">
                {SORTS.map((s) => (
                  <button key={s.value} type="button" aria-pressed={sort === s.value} onClick={() => setSort(s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {loading
            ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)
            : picks.map((r) => <RouteCard key={r.id} route={r} to={routeTo(r.id)} />)}
          {more.length > 0 && (
            <>
              <div className="stack" style={{ gap: 4, marginTop: 16 }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, fontStretch: '112%' }}>{more.length} more {more.length === 1 ? 'option' : 'options'}</h2>
                <p className="muted" style={{ fontSize: 15 }}>The rest of the flights we priced, ranked by the same price, time and fit score. The AI didn't write these up.</p>
              </div>
              {more.map((r) => (
                <RouteCard key={r.id} route={r} to={routeTo(r.id)} />
              ))}
            </>
          )}
          {data && routes.length === 0 && (
            <a
              className="btn btn--ink"
              style={{ alignSelf: 'flex-start' }}
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${query.from.name} to ${query.to.name} on ${query.departWeek.start}`)}`}
            >
              Search these cities on Google Flights
            </a>
          )}
        </section>

        <section className="row" style={{ justifyContent: 'space-between', gap: 16, background: 'var(--signal-soft)', border: '1.5px solid var(--signal)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="stack" style={{ gap: 2 }}>
            <strong style={{ fontSize: 17 }}>{demo ? 'Want this for your own trip?' : 'Send these to someone'}</strong>
            <span style={{ color: 'var(--ink-2)' }}>
              {demo ? 'Sign up free and search any cities and weeks. It takes a minute.' : 'The link holds your search, so whoever opens it (with a free account) sees the same weeks. Fares are estimates until you book.'}
            </span>
          </div>
          {demo ? (
            <Link to="/signup" className="btn btn--ink">Sign up free</Link>
          ) : (
            <button type="button" className="btn btn--ink" onClick={share}>{copied ? 'Link copied' : 'Copy link to these results'}</button>
          )}
        </section>
      </main>
    </>
  );
}
