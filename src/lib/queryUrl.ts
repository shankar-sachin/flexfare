// SearchQuery <-> URL, so results are shareable and survive a reload:
//   /results?trip=round&from=SFO&to=LIS&out=2026-W43&back=2026-W45&stay=range&prio=balance&pax=1&cabin=economy&depth=regular
// `from`/`to` are IATA city codes. `back` is only for round trips. Multi-city adds leg2, leg3, leg4 as
// FROM-TO-WEEK (for example leg2=LIS-PAR-2026-W45). Links without `trip` (older ones) are read as round trip
// when they have `back` and one way when they don't.
import { MAX_LEGS, type City, type Depth, type Priority, type SearchLeg, type SearchQuery, type StayPreference, type TripType } from '../shared/types';
import { MAX_RETURN_GAP_WEEKS, formatIsoWeek, parseIsoWeek, weeksBetween } from '../shared/weeks';

const STAYS: StayPreference[] = ['cheapest', 'range', 'about-two-weeks', 'exact'];
const PRIORITIES: Priority[] = ['price', 'balance', 'speed'];
const CABINS: SearchQuery['cabin'][] = ['economy', 'premium', 'business'];
const DEPTHS: Depth[] = ['regular', 'deep'];
const TRIPS: TripType[] = ['round', 'oneway', 'multi'];
const LEG = /^([A-Z]{3})-([A-Z]{3})-(\d{4}-W\d{2})$/;

export function toSearchParams(q: SearchQuery): URLSearchParams {
  const p = new URLSearchParams({
    trip: q.trip,
    from: q.from.code,
    to: q.to.code,
    out: formatIsoWeek(q.departWeek),
    stay: q.stay,
    prio: q.priority,
    pax: String(q.travelers),
    cabin: q.cabin,
    depth: q.depth,
  });
  if (q.trip === 'round' && q.returnWeek) p.set('back', formatIsoWeek(q.returnWeek));
  if (q.trip === 'multi') q.extraLegs.forEach((l, i) => p.set(`leg${i + 2}`, `${l.from.code}-${l.to.code}-${formatIsoWeek(l.week)}`));
  return p;
}

/**
 * Returns null when the URL isn't a valid search. `lookupCity` turns a city code into a
 * City (name, airports); it can return undefined for codes it doesn't know.
 */
export function parseSearchParams(
  p: URLSearchParams,
  lookupCity: (code: string) => City | undefined,
): SearchQuery | null {
  const from = lookupCity((p.get('from') ?? '').toUpperCase());
  const to = lookupCity((p.get('to') ?? '').toUpperCase());
  const departWeek = parseIsoWeek(p.get('out') ?? '');
  if (!from || !to || !departWeek || from.code === to.code) return null;

  const backRaw = p.get('back');
  const tripRaw = p.get('trip');
  const trip = (tripRaw ?? (backRaw ? 'round' : 'oneway')) as TripType;
  if (!TRIPS.includes(trip)) return null;
  const returnWeek = trip === 'round' && backRaw ? parseIsoWeek(backRaw) : null;
  if (trip === 'round') {
    if (!returnWeek) return null;
    const gap = weeksBetween(departWeek, returnWeek);
    if (gap < 1 || gap > MAX_RETURN_GAP_WEEKS) return null;
  } else if (backRaw && trip === 'oneway') {
    return null; // a one-way search has no return week
  }

  // Multi-city: flights 2 to 4, each leaving the same week as the previous flight or later.
  const extraLegs: SearchLeg[] = [];
  if (trip === 'multi') {
    let prevWeek = departWeek;
    for (let n = 2; n <= MAX_LEGS; n++) {
      const raw = p.get(`leg${n}`);
      if (!raw) break;
      const m = LEG.exec(raw);
      const legFrom = m && lookupCity(m[1]);
      const legTo = m && lookupCity(m[2]);
      const week = m && parseIsoWeek(m[3]);
      if (!m || !legFrom || !legTo || !week || legFrom.code === legTo.code || weeksBetween(prevWeek, week) < 0) return null;
      extraLegs.push({ from: legFrom, to: legTo, week });
      prevWeek = week;
    }
    if (extraLegs.length < 1) return null; // multi-city needs at least two flights
  }

  const stay = (p.get('stay') ?? 'range') as StayPreference;
  const priority = (p.get('prio') ?? 'balance') as Priority;
  const cabin = (p.get('cabin') ?? 'economy') as SearchQuery['cabin'];
  const depth = (p.get('depth') ?? 'regular') as Depth;
  const travelers = Number(p.get('pax') ?? 1);
  if (!STAYS.includes(stay) || !PRIORITIES.includes(priority) || !CABINS.includes(cabin) || !DEPTHS.includes(depth)) return null;
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 9) return null;

  return { trip, extraLegs, from, to, departWeek, returnWeek, travelers, cabin, stay, priority, depth };
}
