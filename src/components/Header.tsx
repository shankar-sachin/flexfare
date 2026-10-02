import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getMe, useQuota } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { BRAND, LogoMark } from './Logo';

function QuotaPill() {
  const quota = useQuota();
  useEffect(() => {
    if (!quota) getMe().catch(() => undefined);
  }, [quota]);
  if (!quota) return null;
  const regular = Math.max(0, quota.regular.limit - quota.regular.used);
  const deep = Math.max(0, quota.deep.limit - quota.deep.used);
  return (
    <span className="tag" title="Searches reset at 00:00 UTC">
      {regular} regular + {deep} deep left today
    </span>
  );
}

export function Header({ children, showHowItWorks = false }: { children?: ReactNode; showHowItWorks?: boolean }) {
  const { user, loading, emailVerified, phoneOnFile, signOut } = useAuth();
  const ready = !!user && emailVerified && phoneOnFile;
  return (
    <header className="site-header">
      <div className="container site-header__bar">
        <Link to={ready ? '/search' : '/'} className="brand" aria-label={`${BRAND} home`}>
          <LogoMark />
          <span className="brand__word">{BRAND}</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {showHowItWorks && !user && <a href="#how">How it works</a>}
          {!loading && !user && (
            <>
              <Link to="/signin">Sign in</Link>
              <Link to="/signup" className="pill pill--signal">Sign up free</Link>
            </>
          )}
          {!loading && user && (
            <>
              {ready && <QuotaPill />}
              {ready && <Link to="/account">Account</Link>}
              <button type="button" className="linklike" onClick={() => void signOut()}>Sign out</button>
            </>
          )}
        </nav>
      </div>
      {children}
    </header>
  );
}
