// A multi-city trip is searched one flight at a time, each as a plain one-way search.
import { MAX_LEGS, type SearchLeg, type SearchQuery, type TripType } from '../shared/types';
import { weeksBetween } from '../shared/weeks';

/** The flights of a trip as one-way searches. A round trip or one-way is just one search. */
export function legQueries(q: SearchQuery): SearchQuery[] {
  if (q.trip !== 'multi') return [q];
  const legs: SearchLeg[] = [{ from: q.from, to: q.to, week: q.departWeek }, ...q.extraLegs];
  return legs.map((l) => ({
    ...q,
    trip: 'oneway',
    extraLegs: [],
    from: l.from,
    to: l.to,
    departWeek: l.week,
    returnWeek: null,
    stay: 'cheapest',
    depth: 'regular', // each flight of a multi-city trip is a regular search
  }));
}

/** Why a multi-city trip can't be searched yet, or null when it's fine. */
export function legsProblem(q: SearchQuery): string | null {
  if (q.trip !== 'multi') return q.from.code === q.to.code ? 'Pick two different cities.' : null;
  const legs: SearchLeg[] = [{ from: q.from, to: q.to, week: q.departWeek }, ...q.extraLegs];
  if (legs.length < 2) return 'Add at least one more flight.';
  for (const [i, l] of legs.entries()) {
    if (l.from.code === l.to.code) return `Flight ${i + 1}: pick two different cities.`;
    if (i > 0 && weeksBetween(legs[i - 1].week, l.week) < 0) return `Flight ${i + 1} can't leave before flight ${i}.`;
  }
  return null;
}

export interface LegDraft {
  from: SearchLeg['from'];
  to: SearchLeg['to'];
  week: SearchLeg['week'];
}

/** Every flight of a multi-city form, the first one included. */
export const legsOf = (q: SearchQuery): LegDraft[] => [{ from: q.from, to: q.to, week: q.departWeek }, ...q.extraLegs];

/** Applies a list of flights back onto the query (the first flight lives in from/to/departWeek). */
export function withLegs(legs: LegDraft[]): Pick<SearchQuery, 'from' | 'to' | 'departWeek' | 'extraLegs'> {
  const [first, ...rest] = legs;
  return { from: first.from, to: first.to, departWeek: first.week, extraLegs: rest };
}

/**
 * Edits one flight. If you change where a flight ends and the next flight started from that same city,
 * the next one follows (you're connecting them). A flight that started somewhere else (an open-jaw trip) is left alone.
 */
export function editLeg(q: SearchQuery, index: number, patch: Partial<LegDraft>): Pick<SearchQuery, 'from' | 'to' | 'departWeek' | 'extraLegs'> {
  const legs = legsOf(q).map((l) => ({ ...l }));
  const before = legs[index].to;
  legs[index] = { ...legs[index], ...patch };
  const next = legs[index + 1];
  if (patch.to && next && next.from.code === before.code) next.from = patch.to;
  return withLegs(legs);
}

/** Adds a flight that starts where the last one ended and heads home, a couple of weeks later. */
export function addLeg(q: SearchQuery, weeks: SearchQuery['departWeek'][]): Pick<SearchQuery, 'from' | 'to' | 'departWeek' | 'extraLegs'> {
  const legs = legsOf(q);
  if (legs.length >= MAX_LEGS) return withLegs(legs);
  const last = legs[legs.length - 1];
  const at = weeks.findIndex((w) => w.start === last.week.start);
  const week = weeks[Math.min(Math.max(at, 0) + 2, weeks.length - 1)];
  return withLegs([...legs, { from: last.to, to: legs[0].from.code === last.to.code ? last.from : legs[0].from, week }]);
}

export function removeLeg(q: SearchQuery, index: number): Pick<SearchQuery, 'from' | 'to' | 'departWeek' | 'extraLegs'> {
  const legs = legsOf(q);
  if (legs.length <= 2) return withLegs(legs);
  return withLegs(legs.filter((_, i) => i !== index));
}

/** What changes when you switch between round trip, one way and multi-city. */
export function switchTrip(q: SearchQuery, weeks: SearchQuery['departWeek'][], trip: TripType): Partial<SearchQuery> {
  if (trip === q.trip) return {};
  const at = Math.max(0, weeks.findIndex((w) => w.start === q.departWeek.start));
  const later = (n: number) => weeks[Math.min(at + n, weeks.length - 1)];
  if (trip === 'oneway') return { trip, returnWeek: null, extraLegs: [] };
  if (trip === 'round') {
    const back = later(2);
    return { trip, extraLegs: [], returnWeek: back.start > q.departWeek.start ? back : null };
  }
  return { trip, returnWeek: null, depth: 'regular', extraLegs: q.extraLegs.length ? q.extraLegs : [{ from: q.to, to: q.from, week: later(2) }] };
}
