import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ApiError, getAdminStats } from '../lib/api';
import type { AdminStats } from '../shared/types';

const n = (v: number) => v.toLocaleString('en-US');
const usd = (v: number | null) => (v === null ? 'n/a' : `$${v.toFixed(v < 1 ? 3 : 2)}`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card stack" style={{ gap: 4, flex: '1 1 200px' }}>
      <span className="label">{label}</span>
      <strong className="mono" style={{ fontSize: 28 }}>{value}</strong>
      {note && <span className="muted" style={{ fontSize: 14 }}>{note}</span>}
    </div>
  );
}

/** Live usage for the admin account(s): SerpApi credits, searches, Claude tokens and an estimated cost. */
export function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);

  const load = () => {
    setReloading(true);
    getAdminStats()
      .then((s) => {
        setStats(s);
        setError('');
      })
      .catch((e: unknown) => setError(e instanceof ApiError && e.status === 403 ? 'This page is for admins.' : e instanceof Error ? e.message : 'Could not load the stats.'))
      .finally(() => setReloading(false));
  };
  useEffect(load, []);

  const today = stats?.days[0];
  const week = stats?.days.reduce((a, d) => ({ cost: a.cost + (d.costUsd ?? 0), calls: a.calls + d.claudeCalls }), { cost: 0, calls: 0 });
  const pct = stats ? Math.min(100, Math.round((stats.serpapi.used / Math.max(1, stats.serpapi.limit)) * 100)) : 0;

  return (
    <>
      <Header />
      <main className="container stack" style={{ paddingBlock: '40px 80px', gap: 28, maxWidth: 960 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>Admin</h1>
          <button type="button" className="chip" onClick={load} disabled={reloading}>{reloading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        {error && <p role="alert" className="form-error">{error} <Link to="/search">Back to search</Link></p>}
        {!stats && !error && <div className="skeleton" style={{ height: 240 }} aria-label="Loading stats" />}
        {stats && today && week && (
          <>
            <section className="row" style={{ gap: 16, alignItems: 'stretch' }} aria-label="Today">
              <Stat label={`SerpApi credits · ${stats.serpapi.month}`} value={`${n(stats.serpapi.used)} / ${n(stats.serpapi.limit)}`} note={`${pct}% of the monthly cap`} />
              <Stat label="Searches today" value={`${n(today.searches)} / ${n(stats.limits.global)}`} note="Users only; admin searches aren't counted" />
              <Stat label="Claude today" value={usd(today.costUsd)} note={`${n(today.claudeCalls)} calls · ${n(today.tokensIn)} in · ${n(today.tokensOut)} out`} />
              <Stat label="Claude, last 7 days" value={usd(week.cost)} note={`${n(week.calls)} calls`} />
            </section>

            <section className="card stack" style={{ gap: 12 }} aria-labelledby="days-h">
              <h2 id="days-h" style={{ fontSize: 20, fontWeight: 800 }}>Last 7 days (UTC)</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                  <thead>
                    <tr className="label" style={{ textAlign: 'left' }}>
                      <th style={{ padding: '6px 10px 6px 0' }}>Day</th><th>Searches</th><th>Claude calls</th><th>Tokens in</th><th>Tokens out</th><th>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {stats.days.map((d) => (
                      <tr key={d.day} style={{ borderTop: '1px solid var(--line-soft)' }}>
                        <td style={{ padding: '8px 10px 8px 0' }}>{d.day}</td><td>{n(d.searches)}</td><td>{n(d.claudeCalls)}</td><td>{n(d.tokensIn)}</td><td>{n(d.tokensOut)}</td><td>{usd(d.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                Cost is estimated from list prices and the token counts we record per call. It doesn't include SerpApi, and it has nothing from before this page shipped.
              </p>
            </section>

            {today.models.length > 0 && (
              <section className="card stack" style={{ gap: 8 }} aria-labelledby="models-h">
                <h2 id="models-h" style={{ fontSize: 20, fontWeight: 800 }}>Today by model</h2>
                {today.models.map((m) => (
                  <div key={m.model} className="row mono" style={{ justifyContent: 'space-between', gap: 12 }}>
                    <span>{m.model}</span>
                    <span>{n(m.calls)} calls · {n(m.tokensIn)} in · {n(m.tokensOut)} out · {usd(m.costUsd)}</span>
                  </div>
                ))}
              </section>
            )}

            <section className="card stack" style={{ gap: 6 }} aria-labelledby="cfg-h">
              <h2 id="cfg-h" style={{ fontSize: 20, fontWeight: 800 }}>Setup</h2>
              <p className="muted mono" style={{ fontSize: 14 }}>
                Fares: {stats.config.fareProvider} · Claude key: {stats.config.claudeConfigured ? 'set' : 'MISSING'} · Models: {stats.config.claudeModel} / {stats.config.claudeDeepModel} / {stats.config.claudeSummaryModel} · Admins: {stats.config.admins}
              </p>
              <p className="muted mono" style={{ fontSize: 14 }}>
                Daily limits per user: {stats.limits.regular} regular, {stats.limits.deep} deep, {stats.limits.bookPerUser} booking lookups · per IP {stats.limits.ip} · global {stats.limits.global}
              </p>
              <p className="muted" style={{ fontSize: 13 }}>Updated {new Date(stats.generatedAt).toLocaleTimeString()}</p>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
