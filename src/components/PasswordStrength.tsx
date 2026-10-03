import type { Strength } from '../lib/passwordStrength';

/** Four bars that fill left to right as the password gets stronger, with a plain-language tip. */
export function PasswordStrength({ strength, id }: { strength: Strength; id?: string }) {
  if (strength.score === 0 && !strength.label) return null;
  return (
    <div className="strength" data-level={strength.score} id={id}>
      <div
        className="strength__bars"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={strength.label}
      >
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`strength__bar${strength.score >= i ? ' is-on' : ''}`} style={{ ['--i' as string]: i - 1 }} />
        ))}
      </div>
      <p className="strength__row" aria-live="polite">
        <strong key={strength.label} className="strength__label">{strength.label}</strong>
        <span className="muted">{strength.tip}</span>
      </p>
    </div>
  );
}
