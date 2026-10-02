import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { demoQuery } from '../demo/demoResult';
import { DayPicker } from '../components/DayPicker';
import { FindLinks } from '../components/FindLinks';
import { Header } from '../components/Header';
import { Check } from '../components/Icons';
import { LegTimeline } from '../components/Itinerary';
import { useSearch } from '../lib/SearchContext';
import { useCuration } from '../lib/useCuration';
import { useUrlQuery } from '../lib/useUrlQuery';
import { buildLinks } from '../shared/links';
import { parseISO, shortDate, timeAgo } from '../shared/weeks';

const viaText = (via: string) => (via === 'nonstop' ? 'nonstop' : via.includes('· ') ? `via ${via.split('· ')[1]}` : via);

export function RoutePage({ demo = false }: { demo?: boolean }) {
  const { id } = useParams();
  const { weeks } = useSearch();
  const url = useUrlQuery();
  const query = demo ? demoQuery(weeks) : url.query;
  const { data, loading } = useCuration(query, { demo });
  const route = data?.routes.find((r) => r.id === id);
  const backTo = demo ? '/demo' : `/results?${url.params}`;

  const [outIdx, setOutIdx] = useState(0);
  const [backIdx, setBackIdx] = useState(0);

  // Start the day pickers on the days the AI picked.
  useEffect(() => {
    if (!route) return;
    setOutIdx(Math.max(0, route.outDayFares.findIndex((d) => d.date === route.outDate)));
    setBackIdx(Math.max(0, route.backDayFares.findIndex((d) => d.date === route.backDate)));
  }, [route]);

  const outDay = route?.outDayFares[outIdx];
  const backDay = route?.backDayFares[backIdx];
  const outDate = outDay?.date ?? route?.outDate ?? '';
  const backDate = route?.backDate ? (backDay?.date ?? route.backDate) : null;
  const changedDays = !!route && (outDate !== route.outDate || backDate !== route.backDate);

  // Links follow the day you pick. The saved Aviasales deep link only fits the original dates.
  const links = useMemo(() => {
    if (!route || !query) return null;
    if (!changedDays) return route.links;
    return buildLinks({ from: route.fromAirport, to: route.toAirport, outDate, backDate, travelers: query.travelers, cabin: query.cabin });
  }, [route, query, changedDays, outDate, backDate]);

  if (!query || loading || !route || !links) {
    return (
      <>
        <Header />
        <main className="container stack" style={{ paddingBlock: 40, gap: 12 }}>
          {!query ? (
            <>
              <h1>That link isn't valid</h1>
              <Link to="/search">Start a new search</Link>
            </>
          ) : loading || !data ? (
            <div className="skeleton" style={{ height: 480 }} aria-label="Loading route" />
          ) : (
            <>
              <h1>Route not found</h1>
              <p className="muted">It may have been replaced by a newer search.</p>
              <Link to={backTo}>Back to results</Link>
            </>
          )}
        </main>
      </>
    );
  }

  const pickedOut = route.outDayFares.find((d) => d.date === route.outDate)?.delta ?? 0;
  const pickedBack = route.backDayFares.find((d) => d.date === route.backDate)?.delta ?? 0;
  const base = route.price - pickedOut - pickedBack;
  const total = base + (outDay?.delta ?? pickedOut) + (backDay?.delta ?? pickedBack);
  const diff = total - base;
  const nights = backDate ? Math.round((parseISO(backDate).getTime() - parseISO(outDate).getTime()) / 86400000) : route.nights;

  return (
    <>
      <Header />
      <main className="container stack" style={{ paddingBlock: '32px 80px', gap: 28 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 15 }}>
          <Link to={backTo}>← Back to {data?.routes.length} routes</Link>
        </nav>

        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            {route.badge && <span className="tag">{route.badge} · {route.fit}</span>}
            <span className="tag tag--ink">{route.carrier}</span>
            {data?.sample && <span className="tag tag--warn">Sample data</span>}
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1 }}>
            {query.from.name} to {query.to.name}, {viaText(route.via)}
          </h1>
          <p className="mono muted" style={{ fontSize: 15 }}>{route.fromAirport} → {route.toAirport}</p>
        </div>

        <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
          <div className="stack" style={{ flex: '1 1 640px', gap: 20, minWidth: 0 }}>
            {route.outDayFares.length > 0 && (
              <section aria-labelledby="flex-h" className="card stack" style={{ gap: 20 }}>
                <div className="stack" style={{ gap: 4 }}>
                  <h2 id="flex-h" style={{ fontSize: 20, fontWeight: 800 }}>Fine-tune the day</h2>
                  <p className="muted" style={{ fontSize: 15 }}>
                    {demo ? 'Signed-in users can switch days here and the price and links update.' : 'Prices move with the day. Differences are across all flights we saw between these cities.'}
                  </p>
                </div>
                <DayPicker label={`Leave · WK ${query.departWeek.isoWeek} · ${query.departWeek.label}`} days={route.outDayFares} selected={outIdx} onSelect={setOutIdx} disabled={demo} />
                {query.returnWeek && route.backDayFares.length > 0 && (
                  <DayPicker label={`Return · WK ${query.returnWeek.isoWeek} · ${query.returnWeek.label}`} days={route.backDayFares} selected={backIdx} onSelect={setBackIdx} disabled={demo} />
                )}
              </section>
            )}

            <section aria-labelledby="itin-h" className="card stack" style={{ gap: 24 }}>
              <h2 id="itin-h" style={{ fontSize: 20, fontWeight: 800 }}>Itinerary</h2>
              <LegTimeline title={`Outbound · ${shortDate(outDate)}`} leg={route.outbound} />
              {route.inbound && backDate && <LegTimeline title={`Return · ${shortDate(backDate)}`} leg={route.inbound} />}
            </section>
          </div>

          <aside className="stack" style={{ flex: '1 1 340px', maxWidth: 420, gap: 20 }}>
            <section aria-label="Price" className="card card--dark stack" style={{ gap: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
                <div className="stack">
                  <span className="label" style={{ color: 'var(--on-dark-muted)' }}>
                    {route.backDate ? 'Round trip' : 'One way'} · per adult · estimate
                  </span>
                  <span style={{ fontSize: 56, fontWeight: 900, fontStretch: '112%', lineHeight: 1 }} aria-live="polite">${total}</span>
                </div>
                <span className="mono" style={{ fontSize: 14, color: 'var(--signal)', textAlign: 'right' }}>
                  {diff === 0 ? 'Lowest for this route' : `+$${diff} vs lowest`}
                </span>
              </div>
              <span style={{ color: 'var(--on-dark-muted)', fontSize: 15 }}>
                {shortDate(outDate)}
                {backDate && `  →  ${shortDate(backDate)} · ${nights} nights`}
              </span>
              <FindLinks links={links} demo={demo} />
              <span style={{ fontSize: 13, color: '#9ea4ad' }}>
                flexfare doesn't sell tickets. {route.priceFoundAt ? `Fare seen ${timeAgo(route.priceFoundAt)}. ` : ''}The airline sets the final price.
              </span>
            </section>

            <section aria-labelledby="why-h" className="card stack" style={{ gap: 16 }}>
              <h2 id="why-h" style={{ fontSize: 18, fontWeight: 800 }}>Why this made the list</h2>
              <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', gap: 12 }}>
                {route.reasons.map((r) => (
                  <li key={r} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span style={{ flex: '0 0 auto', marginTop: 2 }}><Check /></span>
                    <span style={{ fontSize: 15 }}>{r}</span>
                  </li>
                ))}
              </ul>
              <div className="stack" style={{ gap: 10, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
                {route.scores.map((s) => (
                  <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 32px', gap: 10, alignItems: 'center', fontSize: 14 }}>
                    <span>{s.label}</span>
                    <span className="meter" role="meter" aria-valuenow={s.value} aria-valuemin={0} aria-valuemax={100} aria-label={s.label}>
                      <span style={{ width: `${s.value}%` }} />
                    </span>
                    <span className="mono" style={{ fontWeight: 600, textAlign: 'right' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
