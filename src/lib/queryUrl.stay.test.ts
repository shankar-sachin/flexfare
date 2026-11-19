import { describe, expect, it } from 'vitest';
import type { City, SearchQuery } from '../shared/types';
import { parseIsoWeek } from '../shared/weeks';
import { parseSearchParams, toSearchParams } from './queryUrl';

const sfo: City = { code: 'SFO', name: 'San Francisco', airports: ['SFO', 'OAK'] };
const lis: City = { code: 'LIS', name: 'Lisbon', airports: ['LIS'] };
const lookup = (c: string) => [sfo, lis].find((x) => x.code === c);
const base = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  trip: 'round', extraLegs: [], from: sfo, to: lis, departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W44')!,
  travelers: 1, cabin: 'economy', stay: 'range', priority: 'balance', depth: 'regular', ...over,
});

describe('search url: stay options', () => {
  it('round-trips 1 night and 3-4 nights', () => {
    for (const stay of ['one-night', 'short'] as const) {
      const q = base({ stay });
      expect(parseSearchParams(toSearchParams(q), lookup)).toEqual(q);
    }
  });

  it('round-trips a custom stay through nights=', () => {
    const q = base({ stay: 'custom', customStay: { min: 5, max: 8 }, returnWeek: parseIsoWeek('2026-W45')! });
    const p = toSearchParams(q);
    expect(p.get('nights')).toBe('5-8');
    expect(parseSearchParams(p, lookup)).toEqual(q);
    expect(toSearchParams(base()).has('nights')).toBe(false);
  });

  it('rejects links with a custom stay that is missing or the weeks cannot give', () => {
    const p = toSearchParams(base({ stay: 'custom', customStay: { min: 5, max: 8 }, returnWeek: parseIsoWeek('2026-W45')! }));
    p.delete('nights');
    expect(parseSearchParams(p, lookup)).toBeNull();
    const far = toSearchParams(base({ stay: 'one-night', returnWeek: parseIsoWeek('2026-W47')! }));
    expect(parseSearchParams(far, lookup)).toBeNull();
  });
});
