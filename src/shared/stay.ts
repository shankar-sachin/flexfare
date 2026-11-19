// Stay-length rules shared by the form, the URL, the server and the scoring.
// A stay is the number of nights between the outbound day and the return day.
import type { NightsRange, StayPreference } from './types';

export const MAX_CUSTOM_NIGHTS = 60;
export const DEFAULT_CUSTOM_STAY: NightsRange = { min: 5, max: 7 };

/** Fixed ranges. 'about-two-weeks' is a target (14), not a range, so it is handled in stayScore. */
const BANDS: Partial<Record<StayPreference, NightsRange>> = {
  'one-night': { min: 1, max: 1 },
  short: { min: 3, max: 4 },
  range: { min: 10, max: 16 },
};

/** The nights a preference asks for, or null when it doesn't ask for a particular length. */
export function stayRange(stay: StayPreference, custom?: NightsRange | null): NightsRange | null {
  if (stay === 'custom') return custom ?? null;
  return BANDS[stay] ?? null;
}

/** Score 0-100 for how well `nights` fits the preference. */
export function stayScore(stay: StayPreference, nights: number, custom?: NightsRange | null): number {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  if (stay === 'about-two-weeks') return clamp(100 - 7 * Math.abs(nights - 14));
  const r = stayRange(stay, custom);
  if (!r) return 100; // 'cheapest' ignores stay; 'exact' is always inside the picked weeks
  const miss = nights < r.min ? r.min - nights : nights > r.max ? nights - r.max : 0;
  // 10 to 16 nights is forgiving (8 points a night); short stays and custom ranges are not.
  return clamp(100 - (stay === 'range' ? 8 : stay === 'custom' ? 12 : 20) * miss);
}

/** "7-10" -> { min: 7, max: 10 }. Null unless 1 <= min <= max <= MAX_CUSTOM_NIGHTS. */
export function parseNights(s: string | null | undefined): NightsRange | null {
  const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec((s ?? '').trim());
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === undefined ? min : Number(m[2]);
  return min >= 1 && max >= min && max <= MAX_CUSTOM_NIGHTS ? { min, max } : null;
}

export const formatNights = (r: NightsRange) => (r.min === r.max ? String(r.min) : `${r.min}-${r.max}`);

/** "1 night", "3 to 4 nights". */
export function describeNights(r: NightsRange): string {
  return r.min === r.max ? `${r.min} night${r.min === 1 ? '' : 's'}` : `${r.min} to ${r.max} nights`;
}

/**
 * Why the chosen weeks can't give this stay, or null when they can. Leaving on any day of week A and
 * coming back on any day of a week `gapWeeks` later allows gap*7-6 to gap*7+6 nights.
 * Only the strict choices (1 night, 3-4 nights, custom) are checked; the others just score lower.
 */
export function stayProblem(stay: StayPreference, custom: NightsRange | null | undefined, gapWeeks: number): string | null {
  if (stay === 'custom' && !custom) return 'Enter how many nights you want to stay.';
  if (stay !== 'one-night' && stay !== 'short' && stay !== 'custom') return null;
  const r = stayRange(stay, custom)!;
  const lowest = gapWeeks * 7 - 6;
  const highest = gapWeeks * 7 + 6;
  if (r.max >= lowest && r.min <= highest) return null;
  const what = describeNights(r);
  const near = r.max < lowest ? 'Pick a return week closer to your leave week' : 'Pick a return week further from your leave week';
  return `Weeks ${gapWeeks} ${gapWeeks === 1 ? 'week' : 'weeks'} apart allow stays of ${Math.max(1, lowest)} to ${highest} nights, so ${what} isn't possible. ${near}.`;
}
