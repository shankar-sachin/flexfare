// SearchQuery <-> URL, so results are shareable and survive a reload:
//   /results?from=SFO&to=LIS&out=2026-W43&back=2026-W45&stay=range&prio=balance&pax=1&cabin=economy&depth=regular
// `from`/`to` are IATA city codes. `back` is omitted for one-way.
import type { City, Depth, Priority, SearchQuery, StayPreference } from '../shared/types';
import { MAX_RETURN_GAP_WEEKS, formatIsoWeek, parseIsoWeek, weeksBetween } from '../shared/weeks';

const STAYS: StayPreference[] = ['cheapest', 'range', 'about-two-weeks', 'exact'];
const PRIORITIES: Priority[] = ['price', 'balance', 'speed'];
const CABINS: SearchQuery['cabin'][] = ['economy', 'premium', 'business'];
const DEPTHS: Depth[] = ['regular', 'deep'];

export function toSearchParams(q: SearchQuery): URLSearchParams {
  const p = new URLSearchParams({
    from: q.from.code,
    to: q.to.code,
    out: formatIsoWeek(q.departWeek),
    stay: q.stay,
    prio: q.priority,
    pax: String(q.travelers),
    cabin: q.cabin,
    depth: q.depth,
  });
  if (q.returnWeek) p.set('back', formatIsoWeek(q.returnWeek));
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
  const returnWeek = backRaw ? parseIsoWeek(backRaw) : null;
  if (backRaw && !returnWeek) return null;
  if (returnWeek) {
    const gap = weeksBetween(departWeek, returnWeek);
    if (gap < 1 || gap > MAX_RETURN_GAP_WEEKS) return null;
  }

  const stay = (p.get('stay') ?? 'range') as StayPreference;
  const priority = (p.get('prio') ?? 'balance') as Priority;
  const cabin = (p.get('cabin') ?? 'economy') as SearchQuery['cabin'];
  const depth = (p.get('depth') ?? 'regular') as Depth;
  const travelers = Number(p.get('pax') ?? 1);
  if (!STAYS.includes(stay) || !PRIORITIES.includes(priority) || !CABINS.includes(cabin) || !DEPTHS.includes(depth)) return null;
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 9) return null;

  return { from, to, departWeek, returnWeek, travelers, cabin, stay, priority, depth };
}
