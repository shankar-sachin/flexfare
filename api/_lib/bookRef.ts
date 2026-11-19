// Signs the checkout-lookup reference we put on each route, and checks it when it comes back. Without this a
// signed-in user could send any token (or any airports and dates) and have our SerpApi key search for them.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BookRef } from '../../src/shared/types.js';

const secret = () => process.env.BOOKING_SECRET || process.env.DAILY_SALT || 'flexfare-dev-secret';
const payload = (r: Omit<BookRef, 'sig'>) => JSON.stringify([r.kind, r.token, r.dep, r.arr, r.out, r.back, r.cabin]);
const mac = (r: Omit<BookRef, 'sig'>) => createHmac('sha256', secret()).update(payload(r)).digest('hex');

export const signBookRef = (r: Omit<BookRef, 'sig'>): BookRef => ({ ...r, sig: mac(r) });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const refSchema = z.object({
  kind: z.enum(['departure', 'booking']),
  token: z.string().min(10).max(20000),
  dep: z.string().regex(/^[A-Z]{3}(,[A-Z]{3})*$/),
  arr: z.string().regex(/^[A-Z]{3}(,[A-Z]{3})*$/),
  out: date,
  back: date.nullable(),
  cabin: z.enum(['economy', 'premium', 'business']),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});

/** The reference if it is well formed and we signed it, otherwise null. */
export function verifyBookRef(input: unknown): BookRef | null {
  const parsed = refSchema.safeParse(input);
  if (!parsed.success) return null;
  const { sig, ...rest } = parsed.data;
  const want = Buffer.from(mac(rest), 'hex');
  const got = Buffer.from(sig, 'hex');
  return want.length === got.length && timingSafeEqual(want, got) ? parsed.data : null;
}
