// A small, dependency-free password strength estimate. It is advice for the person typing,
// not a security guarantee; Firebase still enforces its own rules.
export type Score = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  score: Score; // 0 = nothing/too short, 1 weak, 2 fair, 3 good, 4 strong
  label: '' | 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  tip: string;
  /** Long enough and not trivially guessable: the minimum to create an account. */
  ok: boolean;
}

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', '12345678', '123456789', '1234567890',
  '11111111', '00000000', 'qwertyui', 'qwertyuiop', 'qwerty123', '1q2w3e4r', 'abc12345', 'abcd1234', 'iloveyou', 'letmein1',
  'welcome1', 'welcome123', 'admin123', 'administrator', 'monkey123', 'dragon123', 'football1', 'baseball1', 'superman1',
  'trustno1', 'sunshine1', 'princess1', 'flexfare', 'flexfare1', 'flexfare123', 'changeme', 'default123', 'asdfghjk', 'zxcvbnm1',
]);

const hasSequence = (s: string) => {
  const t = s.toLowerCase();
  let up = 1;
  let down = 1;
  for (let i = 1; i < t.length; i++) {
    const d = t.charCodeAt(i) - t.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1;
    down = d === -1 ? down + 1 : 1;
    if (up >= 4 || down >= 4) return true; // abcd, 1234, dcba
  }
  return false;
};

/** `personal` = bits of the user's own details (name, email) that shouldn't appear in the password. */
export function passwordStrength(pw: string, personal: string[] = []): Strength {
  if (!pw) return { score: 0, label: '', tip: '', ok: false };
  if (pw.length < 8) return { score: 0, label: 'Too short', tip: `Use at least 8 characters (${8 - pw.length} more).`, ok: false };

  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) return { score: 1, label: 'Weak', tip: "That's a very common password. Try a few unrelated words.", ok: false };
  const bits = personal.flatMap((p) => p.toLowerCase().split(/[^a-z0-9]+/)).filter((b) => b.length >= 3);
  if (bits.some((b) => lower.includes(b))) return { score: 1, label: 'Weak', tip: "Don't use your name or email in your password.", ok: false };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let points = (pw.length >= 20 ? 4 : pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : 1) + (classes >= 3 ? 2 : classes === 2 ? 1 : 0);
  if (hasSequence(pw) || /(.)\1{2,}/.test(pw)) points -= 1;
  if (new Set(pw).size < 6) points -= 1; // e.g. abababab12: few distinct characters

  const score = (points >= 5 ? 4 : points === 4 ? 3 : points === 3 ? 2 : 1) as Score;
  const label = (['', 'Weak', 'Fair', 'Good', 'Strong'] as const)[score];
  const tip =
    score === 4
      ? 'Nice. Strong password.'
      : pw.length < 12
        ? 'Longer is stronger: try 12 or more characters.'
        : classes < 3
          ? 'Mix in numbers, capitals or symbols.'
          : 'Avoid repeated or sequential characters.';
  return { score, label, tip, ok: score >= 2 };
}
