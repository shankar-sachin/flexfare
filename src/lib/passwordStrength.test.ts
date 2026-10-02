import { describe, expect, it } from 'vitest';
import { passwordStrength } from './passwordStrength';

describe('passwordStrength', () => {
  it('says nothing for an empty password and asks for more length when short', () => {
    expect(passwordStrength('')).toMatchObject({ score: 0, label: '', ok: false });
    const s = passwordStrength('abc12');
    expect(s).toMatchObject({ score: 0, label: 'Too short', ok: false });
    expect(s.tip).toContain('3 more');
  });

  it('rejects common and repetitive passwords', () => {
    expect(passwordStrength('password123')).toMatchObject({ score: 1, ok: false });
    expect(passwordStrength('12345678').ok).toBe(false);
    expect(passwordStrength('aaaaaaaaaa')).toMatchObject({ score: 1, ok: false });
  });

  it("rejects passwords built from the user's own name or email", () => {
    const s = passwordStrength('Sachin2026!!', ['Sachin Shankar', 'sachin@example.com']);
    expect(s).toMatchObject({ score: 1, ok: false });
    expect(s.tip).toMatch(/name or email/);
  });

  it('scores longer, mixed passwords higher', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1); // weak: short, one class, a sequence
    expect(passwordStrength('tr0ub4dor&3').score).toBe(2); // fair: mixed but only 11 chars
    expect(passwordStrength('Maple-River42').score).toBe(3); // good: 13 chars, 3+ classes
    const strong = passwordStrength('correct horse battery staple');
    expect(strong.score).toBe(4);
    expect(strong.label).toBe('Strong');
  });

  it('only allows fair or better', () => {
    expect(passwordStrength('abcdefgh').ok).toBe(false);
    expect(passwordStrength('tr0ub4dor&3').ok).toBe(true);
  });
});
