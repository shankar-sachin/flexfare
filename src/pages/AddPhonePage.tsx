import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { ApiError, addPhone } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const COUNTRIES: [string, string][] = [
  ['United States / Canada', '+1'], ['United Kingdom', '+44'], ['Ireland', '+353'], ['France', '+33'], ['Germany', '+49'],
  ['Spain', '+34'], ['Portugal', '+351'], ['Italy', '+39'], ['Netherlands', '+31'], ['Belgium', '+32'], ['Switzerland', '+41'],
  ['Sweden', '+46'], ['Norway', '+47'], ['Denmark', '+45'], ['Poland', '+48'], ['India', '+91'], ['Australia', '+61'],
  ['New Zealand', '+64'], ['Japan', '+81'], ['South Korea', '+82'], ['Singapore', '+65'], ['United Arab Emirates', '+971'],
  ['Brazil', '+55'], ['Mexico', '+52'], ['South Africa', '+27'],
];

/** Builds "+<country><digits>" from what was typed. A typed leading "+" wins. */
export function toE164(dial: string, typed: string): string {
  const t = typed.trim();
  if (t.startsWith('+')) return `+${t.replace(/\D/g, '')}`;
  let digits = t.replace(/\D/g, '');
  if (dial !== '+1') digits = digits.replace(/^0+/, ''); // national trunk prefix, e.g. UK 07...
  return `${dial}${digits}`;
}

export function AddPhonePage() {
  const { phoneOnFile, emailVerified, refresh } = useAuth();
  const navigate = useNavigate();
  const [dial, setDial] = useState('+1');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!emailVerified) return <Navigate to="/verify-email" replace />;
  if (phoneOnFile) return <Navigate to="/search" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await addPhone(toE164(dial, number));
      await refresh();
      navigate('/search', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="One last step" intro="We ask for a phone number to keep free accounts fair. We don't text you, don't verify it, and don't share it. We only keep a scrambled version.">
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="dial">Country</label>
          <select id="dial" value={dial} onChange={(e) => setDial(e.target.value)}>
            {COUNTRIES.map(([name, code]) => <option key={name} value={code}>{name} ({code})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(e) => setNumber(e.target.value)} required />
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="submit" className="btn btn--signal" disabled={busy || number.replace(/\D/g, '').length < 6}>Continue</button>
      </form>
    </AuthShell>
  );
}
