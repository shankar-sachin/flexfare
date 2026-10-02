// Phone numbers are collected but NOT verified (no SMS). They only deter casual multi-accounting:
// one number can belong to one account. We store an HMAC hash, never the number itself.
import { createHmac } from 'node:crypto';

const E164 = /^\+[1-9]\d{7,14}$/;

/** "+1 (415) 555-0100" -> "+14155550100". Returns null if it isn't a plausible E.164 number. */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s().-]/g, '');
  return E164.test(cleaned) ? cleaned : null;
}

/** True if the digits contain `len` consecutive ascending or descending digits (123456, 987654). */
function hasRun(digits: string, len: number): boolean {
  let up = 1;
  let down = 1;
  for (let i = 1; i < digits.length; i++) {
    const diff = Number(digits[i]) - Number(digits[i - 1]);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    if (up >= len || down >= len) return true;
  }
  return false;
}

/** Rejects numbers that are obviously typed to get past the form. Not a validity check. */
export function isFakeLooking(e164: string): boolean {
  const digits = e164.slice(1);
  if (/^(\d)\1+$/.test(digits)) return true; // 1111111111
  if (hasRun(digits, 6)) return true; // 1234567890, 9876543210
  const national = digits.slice(-7);
  if (/^555-?01\d\d$/.test(`${national.slice(0, 3)}-${national.slice(3)}`)) return true; // fiction range
  if (new Set(digits.slice(-8)).size <= 2) return true; // 12121212, 11112222
  return false;
}

export function hashPhone(e164: string, secret: string): string {
  return createHmac('sha256', secret).update(e164).digest('hex');
}
