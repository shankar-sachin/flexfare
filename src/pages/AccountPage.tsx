import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ApiError, deleteAccount, getMe, type Me } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const q = (r: Record<string, string | number | null>) => new URLSearchParams(Object.entries(r).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));

export function AccountPage() {
  const { signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMe().then(setMe).catch((e: Error) => setError(e.message));
  }, []);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount();
      await signOut();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete your account. Please try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container stack" style={{ paddingBlock: '40px 80px', gap: 28, maxWidth: 760 }}>
        <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>Account</h1>
        {error && <p role="alert" className="form-error">{error}</p>}
        {!me && !error && <div className="skeleton" style={{ height: 200 }} aria-label="Loading account" />}
        {me && (
          <>
            <section className="card stack" style={{ gap: 8 }}>
              <span className="label">Signed in as</span>
              <strong style={{ fontSize: 18 }}>{me.email}</strong>
              <p className="muted">
                {Math.max(0, me.limit - me.used)} of {me.limit} AI searches left today. They reset at{' '}
                {me.resetsAt ? new Date(me.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '00:00 UTC'} your time.
              </p>
            </section>

            <section className="card stack" style={{ gap: 12 }} aria-labelledby="recent-h">
              <h2 id="recent-h" style={{ fontSize: 20, fontWeight: 800 }}>Recent searches</h2>
              {me.recent.length === 0 && <p className="muted">Nothing yet. <Link to="/search">Start a search</Link>.</p>}
              <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', gap: 10 }}>
                {me.recent.map((r) => (
                  <li key={r.id} className="row" style={{ justifyContent: 'space-between', gap: 12, paddingBlock: 6, borderTop: '1px solid var(--line-soft)' }}>
                    <span className="stack" style={{ gap: 2 }}>
                      <strong>{String(r.query.from)} → {String(r.query.to)} · {String(r.query.out)}{r.query.back ? ` → ${String(r.query.back)}` : ''}</strong>
                      <span className="muted" style={{ fontSize: 14 }}>{r.headline} · from ${r.topPrice}</span>
                    </span>
                    <Link to={`/results?${q(r.query)}`} className="btn btn--outline">Open</Link>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: 14 }}>Searches from the last 6 hours reopen for free. Older ones use a new search.</p>
            </section>

            <section className="card stack" style={{ gap: 12 }}>
              <button type="button" className="btn btn--outline" style={{ alignSelf: 'flex-start' }} onClick={() => void signOut()}>Sign out</button>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Delete account</h2>
              <p className="muted">This removes your account, search history and saved phone details. It can't be undone.</p>
              {!confirm ? (
                <button type="button" className="btn btn--outline" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Delete my account</button>
              ) : (
                <div className="row" style={{ gap: 12 }}>
                  <button type="button" className="btn btn--ink" disabled={busy} onClick={() => void remove()}>Yes, delete everything</button>
                  <button type="button" className="btn btn--outline" disabled={busy} onClick={() => setConfirm(false)}>Keep my account</button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
