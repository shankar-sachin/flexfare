import { z } from 'zod';
import { HORIZON_WEEKS, MAX_RETURN_GAP_WEEKS, formatIsoWeek, parseIsoWeek, upcomingWeeks, weeksBetween } from '../../src/shared/weeks.js';
import type { Depth, Priority, StayPreference } from '../../src/shared/types.js';
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
  depth: z.enum(['regular', 'deep']).default('regular'),
});

export interface ValidQuery {
  query: NormalizedQuery;
  stay: StayPreference;
  priority: Priority;
  depth: Depth;
  cacheKey: unknown;
}

const bad = (message: string) => new HttpError(400, 'BAD_REQUEST', message);

export function validateCurate(body: unknown): ValidQuery {
  const parsed = curateBody.safeParse(body);
  if (!parsed.success) throw bad('That search looks incomplete. Check the cities and weeks.');
  const b = parsed.data;
  if (b.from === b.to) throw bad('Pick two different cities.');

  const allowed = upcomingWeeks(HORIZON_WEEKS);
  const departWeek = parseIsoWeek(b.out);
  if (!departWeek || !allowed.some((w) => w.start === departWeek.start)) throw bad('Pick a leave week within the next 6 months.');
  let returnWeek = null;
  if (b.back) {
    returnWeek = parseIsoWeek(b.back);
    if (!returnWeek) throw bad('That return week is not valid.');
    const gap = weeksBetween(departWeek, returnWeek);
    if (gap < 1 || gap > MAX_RETURN_GAP_WEEKS) throw bad(`Return 1 to ${MAX_RETURN_GAP_WEEKS} weeks after you leave.`);
  }
  return {
    query: { from: b.from, to: b.to, departWeek, returnWeek, travelers: b.pax, cabin: b.cabin },
    stay: b.stay,
    priority: b.prio,
    depth: b.depth,
    // pax/cabin are in the key because the booking links embed them; depth because a deep search must
    // never be answered from a regular search's cache (it was paid for with the day's one deep search).
    cacheKey: [b.from, b.to, formatIsoWeek(departWeek), returnWeek ? formatIsoWeek(returnWeek) : null, b.stay, b.prio, b.pax, b.cabin, b.depth, process.env.FARE_PROVIDER ?? 'simulated'],
  };
}
