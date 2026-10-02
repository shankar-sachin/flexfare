import { onIdTokenChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, firebaseConfigured } from './firebase';

interface AuthState {
  configured: boolean;
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  /** Set by the server (custom claim) once a phone number is on file. Not verified by SMS. */
  phoneOnFile: boolean;
  /** Reload the user and force a fresh ID token so new claims show up. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [flags, setFlags] = useState({ emailVerified: false, phoneOnFile: false });

  const read = useCallback(async (u: User | null) => {
    if (!u) return setFlags({ emailVerified: false, phoneOnFile: false });
    const t = await u.getIdTokenResult();
    setFlags({ emailVerified: u.emailVerified, phoneOnFile: t.claims.phoneOnFile === true });
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onIdTokenChanged(auth, async (u) => {
      await read(u);
      setUser(u);
      setLoading(false);
    });
  }, [read]);

  const refresh = useCallback(async () => {
    const u = auth?.currentUser;
    if (!u) return;
    await u.reload();
    await u.getIdToken(true);
    await read(u);
    setUser(u);
  }, [read]);

  const signOut = useCallback(async () => {
    if (auth) await fbSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ configured: firebaseConfigured, user, loading, ...flags, refresh, signOut }),
    [user, loading, flags, refresh, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
