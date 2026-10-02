import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { ApiError, sendEmailCode, verifyEmailCode } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export function VerifyEmailPage() {
  const { user, emailVerified, phoneOnFile, refresh, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const asked = useRef(false);

  const request = async (manual: boolean) => {
    setError('');
    try {
      const r = await sendEmailCode();
      if (r.verified) return void (await refresh());
      setCooldown(r.retryAfter ?? 60);
      if (manual && r.sent) setInfo('A new code is on its way.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the code. Please try again.');
    }
  };

  // Send the first code when this screen opens. The server ignores repeats within a minute,
  // so a reload or a double render never sends two emails.
  useEffect(() => {
    if (asked.current || !user) return;
    asked.current = true;
    void request(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (busy || !/^\d{6}$/.test(value)) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await verifyEmailCode(value);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (!phoneOnFile) return <Navigate to="/add-phone" replace />;
  if (emailVerified) return <Navigate to="/search" replace />;

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');
    if (digits.length === 6) void submit(digits); // entering the last digit submits
  };

  return (
    <AuthShell title="Verification">
      <p>
        Email chosen. Email sent to <strong style={{ overflowWrap: 'anywhere' }}>{user?.email ?? 'your email'}</strong>.
      </p>
      <form className="stack" style={{ gap: 14 }} onSubmit={(e: FormEvent) => (e.preventDefault(), void submit(code))}>
        <div className="field">
          <label htmlFor="code">Enter code</label>
          <input
            id="code"
            className="code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            disabled={busy}
            autoFocus
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        {info && <p role="status" className="form-ok">{info}</p>}
        <button type="submit" className="btn btn--ink" disabled={busy || code.length !== 6}>Verify</button>
      </form>
      <button type="button" className="btn btn--outline" disabled={cooldown > 0 || busy} onClick={() => void request(true)}>
        {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </button>
      <button type="button" className="linklike" style={{ color: 'var(--link)', alignSelf: 'flex-start' }} onClick={() => void signOut()}>
        Use a different account
      </button>
    </AuthShell>
  );
}
