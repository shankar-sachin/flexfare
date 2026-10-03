import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { ArrowRight } from '../components/Icons';
import { RouteCard } from '../components/RouteCard';
import { ApiError, curateRoutes } from '../lib/api';
import { legQueries } from '../lib/legs';
import { toSearchParams } from '../lib/queryUrl';
import type { CurationResult, SearchQuery } from '../shared/types';

type LegState =
  | { status: 'waiting' }
  | { status: 'loading' }
  | { status: 'done'; data: CurationResult }
  | { status: 'error'; message: string; skipped?: boolean };

/** Quota/capacity errors mean the later flights can't be searched either. */
const stopsEverything = (e: unknown) => e instanceof ApiError && (e.code === 'QUOTA_EXCEEDED' || e.code === 'BUSY');

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/**
 * A multi-city trip is a handful of one-way searches, run one after another (so the AI service's
 * per-minute limit isn't hit by several at once). Each flight shows its own options; the totals add them up.
 */
export function MultiResultsPage({ query }: { query: SearchQuery }) {
  const legs = useMemo(() => legQueries(query), [query]);
  const [states, setStates] = useState<LegState[]>(() => legs.map(() => ({ status: 'waiting' })));
  const key = legs.map((l) => toSearchParams(l).toString()).join('|');

  useEffect(() => {
    let live = true;
    setStates(legs.map(() => ({ status: 'waiting' })));
    (async () => {
      for (let i = 0; i < legs.length; i++) {
        if (!live) return;
        setStates((s) => s.map((x, j) => (j === i ? { status: 'loading' } : x)));
        try {
          const data = await curateRoutes(legs[i]);
          if (live) setStates((s) => s.map((x, j) => (j === i ? { status: 'done', data } : x)));
        } catch (e) {
          if (!live) return;
          const message = e instanceof Error ? e.message : 'Something went wrong.';
          if (stopsEverything(e)) {
            setStates((s) => s.map((x, j) => (j < i ? x : j === i ? { status: 'error', message } : { status: 'error', message, skipped: true })));
            return;
          }
          setStates((s) => s.map((x, j) => (j === i ? { status: 'error', message } : x)));
        }
      }
    })();
    return () => {
      live = false;
    };
    // `key` is the stable identity of the trip; `legs` is rebuilt on every parse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const done = states.filter((s): s is Extract<LegState, { status: 'done' }> => s.status === 'done');
  const allDone = done.length === legs.length && done.every((d) => d.data.routes.length > 0);
  const cheapest = allDone ? done.reduce((sum, d) => sum + Math.min(...d.data.routes.map((r) => r.price)), 0) : null;
  const topPicks = allDone ? done.reduce((sum, d) => sum + d.data.routes[0].price, 0) : null;
  const sample = done.some((d) => d.data.sample);

  return (
    <>
      <Header>
        <div style={{ borderTop: '1px solid var(--on-dark-line)' }}>
          <div className="container row" style={{ gap: '12px 28px', paddingBlock: 16 }}>
            <span className="row" style={{ gap: 10, fontSize: 20, fontWeight: 800, fontStretch: '110%' }}>
              {legs[0].from.name}
              {legs.map((l, i) => (
                <span key={i} className="row" style={{ gap: 10 }}>
                  <ArrowRight color="var(--signal)" /> {l.to.name}
                </span>
              ))}
            </span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--on-dark-muted)' }}>
              {legs.length} flights · {query.travelers} {query.travelers === 1 ? 'adult' : 'adults'} · <span style={{ textTransform: 'capitalize' }}>{query.cabin}</span>
            </span>
            <Link to="/search" style={{ marginLeft: 'auto', color: 'var(--signal)', fontWeight: 600 }}>Edit search</Link>
          </div>
        </div>
      </Header>

      <main className="container stack" style={{ paddingBlock: '40px 80px', gap: 32 }}>
        {sample && <p className="form-ok" role="note"><strong>Sample data.</strong> These fares are simulated for development, not real prices.</p>}

        <section aria-label="Trip total" className="card card--dark stack" style={{ borderRadius: 'var(--r-xl)', padding: 28, gap: 12 }}>
          <span className="mono" style={{ fontSize: 14, color: 'var(--signal)' }}>your {legs.length}-flight trip</span>
          {allDone ? (
            <>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 900, fontStretch: '115%', letterSpacing: '-0.02em' }}>
                {money(cheapest!)} for the cheapest combination
              </h1>
              <p style={{ color: 'var(--on-dark-muted)' }}>
                {topPicks === cheapest
                  ? `That's also our top pick for every flight. `
                  : `Our top pick for each flight comes to ${money(topPicks!)}. `}
                Prices are per adult, estimates, and add up {legs.length} separate one-way tickets. You book each flight on its own, so a delay on one flight won't be protected on the next.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, fontStretch: '115%' }}>
                {states.some((s) => s.status === 'loading') ? `Searching flight ${states.findIndex((s) => s.status === 'loading') + 1} of ${legs.length}…` : 'Some flights need another look'}
              </h1>
              <p style={{ color: 'var(--on-dark-muted)' }}>We search the flights one at a time. The trip total appears when every flight has options.</p>
            </>
          )}
        </section>

        {legs.map((leg, i) => {
          const st = states[i];
          const picks = st.status === 'done' ? st.data.routes : [];
          const params = toSearchParams(leg);
          return (
            <section key={i} aria-labelledby={`leg-${i}`} className="stack" style={{ gap: 16 }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="mono muted" style={{ fontSize: 13, letterSpacing: '0.06em' }}>FLIGHT {i + 1}</span>
                <h2 id={`leg-${i}`} style={{ fontSize: 26, fontWeight: 900, fontStretch: '112%' }}>
                  {leg.from.name} to {leg.to.name}
                </h2>
                <span className="mono muted" style={{ fontSize: 14 }}>WK {leg.departWeek.isoWeek} · {leg.departWeek.label}</span>
              </div>

              {(st.status === 'waiting' || st.status === 'loading') && (
                <div className="skeleton" style={{ height: st.status === 'loading' ? 170 : 90 }} aria-label={st.status === 'loading' ? `Searching flight ${i + 1}` : `Flight ${i + 1} is waiting`} />
              )}
              {st.status === 'error' && (
                <p role="alert" className="form-error">
                  <strong>{st.skipped ? 'Not searched.' : "Couldn't search this flight."}</strong> {st.message}
                </p>
              )}
              {st.status === 'done' && st.data.dataNote && <p className="form-ok" role="note">{st.data.dataNote}</p>}
              {st.status === 'done' && picks.length === 0 && <p className="muted">No fares found for this flight and week. Try a nearby week.</p>}
              {picks.map((r) => <RouteCard key={r.id} route={r} to={`/route/${r.id}?${params}`} />)}
            </section>
          );
        })}
      </main>
    </>
  );
}
