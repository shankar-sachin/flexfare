import { useId, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'new-password' | 'current-password';
  describedBy?: string;
  invalid?: boolean;
}

/** Password input with a show/hide toggle (a real button, so it works with keyboard and screen readers). */
export function PasswordField({ label, value, onChange, autoComplete, describedBy, invalid }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="field__toggle" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
