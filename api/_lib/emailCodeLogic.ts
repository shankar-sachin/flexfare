// The rules for emailed 6-digit codes, kept pure (no database) so they can be tested.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 3_600_000;

export interface CodeDoc {
  hash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
  hourStart: number;
  sendsThisHour: number;
}

export const makeCode = () => String(randomInt(100000, 1000000));

/** Only a keyed hash is stored, so a database leak doesn't reveal live codes. */
export const hashCode = (uid: string, code: string, secret: string) =>
  createHmac('sha256', secret).update(`${uid}:${code}`).digest('hex');

export type SendPlan =
  | { action: 'wait'; retryAfter: number }
  | { action: 'limit'; retryAfter: number }
  | { action: 'send'; code: string; doc: CodeDoc };

/** Decides whether a new code may be sent right now. */
export function planSend(prev: CodeDoc | undefined, uid: string, secret: string, now: number, generate = makeCode): SendPlan {
  if (prev && now - prev.sentAt < RESEND_MS) return { action: 'wait', retryAfter: Math.ceil((RESEND_MS - (now - prev.sentAt)) / 1000) };
  const sameHour = !!prev && now - prev.hourStart < HOUR_MS;
  const sends = sameHour ? prev!.sendsThisHour : 0;
  if (sends >= MAX_SENDS_PER_HOUR) return { action: 'limit', retryAfter: Math.ceil((prev!.hourStart + HOUR_MS - now) / 1000) };
  const code = generate();
  return {
    action: 'send',
    code,
    doc: {
      hash: hashCode(uid, code, secret),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
      hourStart: sameHour ? prev!.hourStart : now,
      sendsThisHour: sends + 1,
    },
  };
}

export type CheckOutcome = 'ok' | 'wrong' | 'expired' | 'locked';

export function checkCode(doc: CodeDoc | undefined, uid: string, code: string, secret: string, now: number): CheckOutcome {
  if (!doc || now > doc.expiresAt) return 'expired';
  if (doc.attempts >= MAX_ATTEMPTS) return 'locked';
  const a = Buffer.from(hashCode(uid, code, secret));
  const b = Buffer.from(doc.hash);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'wrong';
}
