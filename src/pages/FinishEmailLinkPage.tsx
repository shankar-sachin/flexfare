import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { authMessage, forgetEmail, recalledEmail } from '../lib/authErrors';
import { auth } from '../lib/firebase';

/** Completes a magic-link sign-in. If the email wasn't saved (another device), asks for it again. */
export function FinishEmailLinkPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(recalledEmail());
  const [needEmail, setNeedEmail] = useState(false);
  const [error, setError] = useState('');
  const valid = !!auth && isSignInWithEmailLink(auth, window.location.href);

  const finish = async (address: string) => {
    try {
      await signInWithEmailLink(auth!, address, window.location.href);
      forgetEmail();
      navigate('/search', { replace: true });
    } catch (e) {
      setError(authMessage(e));
    }
  };

  useEffect(() => {
    if (!valid) return;
    const saved = recalledEmail();
    if (saved) void finish(saved);
    else setNeedEmail(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    void finish(email.trim());
  };

  if (!valid) {
    return (
      <AuthShell title="This link isn't valid">
        <p className="muted">It may have expired or been opened already.</p>
        <Link to="/signin" className="btn btn--ink">Back to sign in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Signing you in…" intro={needEmail ? 'Confirm the email you used so we can finish.' : undefined}>
      {error && <p role="alert" className="form-error">{error} <Link to="/signin">Request a new link</Link></p>}
      {needEmail && !error && (
        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn--ink">Continue</button>
        </form>
      )}
    </AuthShell>
  );
}
