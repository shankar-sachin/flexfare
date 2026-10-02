import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { auth } from '../lib/firebase';
import { authMessage, rememberEmail } from '../lib/authErrors';
import { isDisposableEmail } from '../shared/disposable';

type Mode = 'signin' | 'signup';

export function AuthPage({ mode }: { mode: Mode }) {
  const signup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checkEmail = () => {
    if (!email.trim()) throw Object.assign(new Error(), { code: 'auth/invalid-email' });
    if (signup && isDisposableEmail(email)) {
      setError('Please use a permanent email address.');
      return false;
    }
    return true;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    void run(async () => {
      if (!checkEmail()) return;
      if (signup) {
        if (password.length < 8) throw Object.assign(new Error(), { code: 'auth/weak-password' });
        const cred = await createUserWithEmailAndPassword(auth!, email.trim(), password);
        await sendEmailVerification(cred.user).catch(() => undefined);
      } else {
        await signInWithEmailAndPassword(auth!, email.trim(), password);
      }
    });
  };

  const google = () =>
    run(async () => {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth!, provider);
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth!, provider);
        else throw e;
      }
    });

  const magicLink = () =>
    run(async () => {
      if (!checkEmail()) return;
      await sendSignInLinkToEmail(auth!, email.trim(), { url: `${window.location.origin}/auth/finish`, handleCodeInApp: true });
      rememberEmail(email.trim());
      setInfo(`We sent a sign-in link to ${email.trim()}. Open it on this device to continue.`);
    });

  const reset = () =>
    run(async () => {
      if (!email.trim()) throw Object.assign(new Error(), { code: 'auth/invalid-email' });
      await sendPasswordResetEmail(auth!, email.trim()).catch(() => undefined);
      setInfo('If that email has an account, a reset link is on its way.');
    });

  return (
    <AuthShell
      title={signup ? 'Create your free account' : 'Welcome back'}
      intro={signup ? 'Free accounts get 5 AI route searches a day. No card needed.' : 'Sign in to search your own cities and weeks.'}
    >
      <button type="button" className="btn btn--outline" disabled={busy} onClick={() => void google()}>
        Continue with Google
      </button>
      <div className="divider">or use your email</div>

      <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password{signup ? ' (8+ characters)' : ''}</label>
          <input
            id="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        {info && <p role="status" className="form-ok">{info}</p>}
        <button type="submit" className="btn btn--ink" disabled={busy || !password}>
          {signup ? 'Create account' : 'Sign in'}
        </button>
        <button type="button" className="btn btn--outline" disabled={busy || !email} onClick={() => void magicLink()}>
          Email me a sign-in link instead
        </button>
        {!signup && (
          <button type="button" className="linklike" style={{ color: 'var(--link)', alignSelf: 'flex-start' }} disabled={busy} onClick={() => void reset()}>
            Forgot your password?
          </button>
        )}
      </form>

      <p className="muted" style={{ fontSize: 15 }}>
        {signup ? (
          <>Already have an account? <Link to="/signin">Sign in</Link></>
        ) : (
          <>New to flexfare? <Link to="/signup">Create a free account</Link></>
        )}
      </p>
    </AuthShell>
  );
}
