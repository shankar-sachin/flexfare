import { sendEmailVerification } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../lib/AuthContext';
import { authMessage } from '../lib/authErrors';

export function VerifyEmailPage() {
  const { user, emailVerified, refresh, signOut } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Check again when the user comes back to this tab after clicking the emailed link.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (emailVerified) return <Navigate to="/add-phone" replace />;

  const resend = async () => {
    if (!user) return;
    setError('');
    try {
      await sendEmailVerification(user);
      setInfo('Sent. Check your inbox and spam folder.');
      setCooldown(60);
    } catch (e) {
      setError(authMessage(e));
    }
  };
  const check = async () => {
    setChecking(true);
    setInfo('');
    await refresh();
    setChecking(false);
    setInfo("Not verified yet. Open the link in the email we sent, then come back.");
  };

  return (
    <AuthShell title="Check your inbox" intro={`We sent a verification link to ${user?.email ?? 'your email'}. Open it, then come back here.`}>
      {error && <p role="alert" className="form-error">{error}</p>}
      {info && <p role="status" className="form-ok">{info}</p>}
      <button type="button" className="btn btn--ink" disabled={checking} onClick={() => void check()}>I've verified my email</button>
      <button type="button" className="btn btn--outline" disabled={cooldown > 0} onClick={() => void resend()}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
      </button>
      <button type="button" className="linklike" style={{ color: 'var(--link)', alignSelf: 'flex-start' }} onClick={() => void signOut()}>
        Use a different account
      </button>
    </AuthShell>
  );
}
