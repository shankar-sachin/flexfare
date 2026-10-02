import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Header } from './Header';

function Pending() {
  return (
    <>
      <Header />
      <main className="container" style={{ paddingBlock: 40 }}>
        <div className="skeleton" style={{ height: 320 }} aria-label="Loading" />
      </main>
    </>
  );
}

function NotConfigured() {
  return (
    <>
      <Header />
      <main className="container stack" style={{ paddingBlock: 48, gap: 12, maxWidth: 640 }}>
        <h1 className="display" style={{ fontSize: 36 }}>Sign-in isn't set up yet</h1>
        <p className="muted">
          Add your Firebase web config to <code>.env</code> (see <code>.env.example</code>) and restart the dev server. The demo works without it.
        </p>
      </main>
    </>
  );
}

/** Signed in, phone on file, email verified. Anything missing sends the user to the right step, in that order. */
export function Gate({ children }: { children: ReactNode }) {
  const { configured, user, loading, emailVerified, phoneOnFile } = useAuth();
  const loc = useLocation();
  if (!configured) return <NotConfigured />;
  if (loading) return <Pending />;
  if (!user) return <Navigate to="/signin" replace state={{ from: loc.pathname + loc.search }} />;
  if (!phoneOnFile) return <Navigate to="/add-phone" replace />;
  if (!emailVerified) return <Navigate to="/verify-email" replace />;
  return <>{children}</>;
}

/** For sign-in / sign-up: signed-in users go on to wherever they were headed. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { configured, user, loading } = useAuth();
  const loc = useLocation();
  if (!configured) return <NotConfigured />;
  if (loading) return <Pending />;
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/search'} replace />;
  return <>{children}</>;
}

/** For the onboarding steps (verify email, add phone): needs a signed-in user, nothing more. */
export function NeedsUser({ children }: { children: ReactNode }) {
  const { configured, user, loading } = useAuth();
  if (!configured) return <NotConfigured />;
  if (loading) return <Pending />;
  if (!user) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
