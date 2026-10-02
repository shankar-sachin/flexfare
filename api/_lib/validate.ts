import { z } from 'zod';
import { formatIsoWeek, parseIsoWeek, upcomingWeeks, weeksBetween } from '../../src/shared/weeks.js';
import type { Priority, StayPreference } from '../../src/shared/types.js';
import { HttpError } from './http.js';
import type { NormalizedQuery } from './providers/types.js';

const code = z.string().regex(/^[A-Z]{3}$/);

export const curateBody = z.object({
  from: code,
  to: code,
  out: z.string(),
  back: z.string().nullish(),
  stay: z.enum(['cheapest', 'range', 'about-two-weeks', 'exact']),
  prio: z.enum(['price', 'balance', 'speed']),
  pax: z.number().int().min(1).max(9),
  cabin: z.enum(['economy', 'premium', 'business']),
});

export interface ValidQuery {
  query: NormalizedQuery;
  stay: StayPreference;
  priority: Priority;
  cacheKey: unknown;
}

const bad = (message: string) => new HttpError(400, 'BAD_REQUEST', message);

export function validateCurate(body: unknown): ValidQuery {
  const parsed = curateBody.safeParse(body);
  if (!parsed.success) throw bad('That search looks incomplete. Check the cities and weeks.');
  const b = parsed.data;
  if (b.from === b.to) throw bad('Pick two different cities.');

  const allowed = upcomingWeeks(12);
  const departWeek = parseIsoWeek(b.out);
  if (!departWeek || !allowed.some((w) => w.start === departWeek.start)) throw bad('Pick a leave week from the next 12 weeks.');
  let returnWeek = null;
  if (b.back) {
    returnWeek = parseIsoWeek(b.back);
    if (!returnWeek) throw bad('That return week is not valid.');
    const gap = weeksBetween(departWeek, returnWeek);
    if (gap < 1 || gap > 8) throw bad('Return 1 to 8 weeks after you leave.');
  }
  return {
    query: { from: b.from, to: b.to, departWeek, returnWeek, travelers: b.pax, cabin: b.cabin },
    stay: b.stay,
    priority: b.prio,
    // pax/cabin are in the key because the booking links embed them.
    cacheKey: [b.from, b.to, formatIsoWeek(departWeek), returnWeek ? formatIsoWeek(returnWeek) : null, b.stay, b.prio, b.pax, b.cabin, process.env.FARE_PROVIDER ?? 'simulated'],
  };
}
