// Google Flights can only price one day combination per search, and every search costs a credit.
// So instead of all 49 (out day x back day), pick the few that fit the traveler best.
import type { StayPreference, Week } from '../../../src/shared/types.js';
import { addDays, weeksBetween } from '../../../src/shared/weeks.js';
import { stayScore } from '../scoring.js';

export interface DatePair {
  outDate: string;
  backDate: string | null;
}

/** How often each weekday (Mon..Sun) is among the cheaper days to fly. Tue/Wed best, Fri/Sun dearest. */
const PRIOR = [0.5, 1, 1, 0.6, 0.2, 0.7, 0.3];
/** Penalty for reusing a day we already picked, so the searches cover different days. */
const REUSE = 0.35;

export function pickPairs(departWeek: Week, returnWeek: Week | null, stay: StayPreference, n: number): DatePair[] {
  if (!returnWeek) {
    return [...PRIOR.keys()]
      .sort((a, b) => PRIOR[b] - PRIOR[a])
      .slice(0, n)
      .map((o) => ({ outDate: addDays(departWeek.start, o), backDate: null }));
  }
  const gap = weeksBetween(departWeek, returnWeek) * 7;
  const all = [...PRIOR.keys()].flatMap((o) =>
    [...PRIOR.keys()].map((b) => ({ o, b, base: stayScore(stay, gap + b - o) / 100 + 0.6 * ((PRIOR[o] + PRIOR[b]) / 2) })),
  );
  const chosen: { o: number; b: number }[] = [];
  while (chosen.length < Math.min(n, all.length)) {
    const best = all
      .filter((c) => !chosen.some((p) => p.o === c.o && p.b === c.b))
      .map((c) => ({ ...c, score: c.base - REUSE * chosen.filter((p) => p.o === c.o).length - REUSE * chosen.filter((p) => p.b === c.b).length }))
      .sort((a, b) => b.score - a.score || a.o - b.o || a.b - b.b)[0];
    chosen.push(best);
  }
  return chosen.map(({ o, b }) => ({ outDate: addDays(departWeek.start, o), backDate: addDays(returnWeek.start, b) }));
}
