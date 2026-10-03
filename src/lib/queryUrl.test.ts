import { describe, expect, it } from 'vitest';
import type { City, SearchQuery } from '../shared/types';
import { parseIsoWeek } from '../shared/weeks';
import { parseSearchParams, toSearchParams } from './queryUrl';

const sfo: City = { code: 'SFO', name: 'San Francisco', airports: ['SFO', 'OAK'] };
const lis: City = { code: 'LIS', name: 'Lisbon', airports: ['LIS'] };
const par: City = { code: 'PAR', name: 'Paris', airports: ['CDG', 'ORY'] };
const lookup = (c: string) => [sfo, lis, par].find((x) => x.code === c);
const base = (): SearchQuery => ({
  trip: 'round', extraLegs: [],
  from: sfo, to: lis, departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!,
  travelers: 2, cabin: 'premium', stay: 'range', priority: 'speed', depth: 'deep',
});

describe('search url', () => {
  it('round-trips a round trip', () => {
    const q = base();
    expect(parseSearchParams(toSearchParams(q), lookup)).toEqual(q);
  });

  it('omits back for one-way and parses it back', () => {
    const q: SearchQuery = { ...base(), trip: 'oneway', returnWeek: null };
    const p = toSearchParams(q);
    expect(p.has('back')).toBe(false);
    expect(parseSearchParams(p, lookup)?.returnWeek).toBeNull();
  });

  it('treats a missing depth (older links) as a regular search', () => {
    const p = toSearchParams(base());
    p.delete('depth');
    expect(parseSearchParams(p, lookup)?.depth).toBe('regular');
  });

  it('rejects invalid searches', () => {
    const p = () => toSearchParams(base());
    const bad = (mutate: (p: URLSearchParams) => void) => {
      const x = p();
      mutate(x);
      return parseSearchParams(x, lookup);
    };
    expect(bad((x) => x.set('to', 'SFO'))).toBeNull(); // same city
    expect(bad((x) => x.set('to', 'ZZZ'))).toBeNull(); // unknown city
    expect(bad((x) => x.set('back', '2026-W42'))).toBeNull(); // return before leave
    expect(bad((x) => x.set('back', '2027-W20'))).toBeNull(); // more than 8 weeks later
    expect(bad((x) => x.set('pax', '12'))).toBeNull();
    expect(bad((x) => x.set('cabin', 'luxury'))).toBeNull();
    expect(bad((x) => x.set('depth', 'ultra'))).toBeNull();
    expect(bad((x) => x.set('out', 'nope'))).toBeNull();
  });
});

describe('trip types in the URL', () => {
  const w = (s: string) => parseIsoWeek(s)!;
  const multi = (): SearchQuery => ({
    ...base(), trip: 'multi', returnWeek: null,
    extraLegs: [{ from: lis, to: par, week: w('2026-W45') }, { from: par, to: sfo, week: w('2026-W47') }],
  });

  it('round trip and one way carry `trip`, and one way has no return', () => {
    expect(toSearchParams(base()).get('trip')).toBe('round');
    const one = toSearchParams({ ...base(), trip: 'oneway', returnWeek: null });
    expect(one.get('trip')).toBe('oneway');
    expect(one.has('back')).toBe(false);
  });

  it('multi-city round-trips with its extra flights', () => {
    const p = toSearchParams(multi());
    expect(p.get('trip')).toBe('multi');
    expect(p.get('leg2')).toBe('LIS-PAR-2026-W45');
    expect(p.get('leg3')).toBe('PAR-SFO-2026-W47');
    expect(p.has('back')).toBe(false);
    expect(parseSearchParams(p, lookup)).toEqual(multi());
  });

  it('reads links made before `trip` existed: with a return week it is a round trip, without it is one way', () => {
    const old = toSearchParams(base());
    old.delete('trip');
    expect(parseSearchParams(old, lookup)?.trip).toBe('round');
    old.delete('back');
    const oneWay = parseSearchParams(old, lookup);
    expect(oneWay?.trip).toBe('oneway');
    expect(oneWay?.returnWeek).toBeNull();
  });

  it('rejects contradictory or incomplete trips', () => {
    const bad = (mutate: (p: URLSearchParams) => void, q = base()) => {
      const p = toSearchParams(q);
      mutate(p);
      return parseSearchParams(p, lookup);
    };
    expect(bad((p) => p.delete('back'))).toBeNull(); // round trip without a return week
    expect(bad((p) => p.set('trip', 'sideways'))).toBeNull();
    const oneWay: SearchQuery = { ...base(), trip: 'oneway', returnWeek: null };
    expect(bad((p) => p.set('back', '2026-W45'), oneWay)).toBeNull(); // one way with a return week
    expect(bad((p) => p.delete('leg2'), multi())).toBeNull(); // leg3 without leg2 leaves only one flight
  });

  it('rejects multi-city links that are malformed, out of order, or too short', () => {
    const bad = (mutate: (p: URLSearchParams) => void) => {
      const p = toSearchParams(multi());
      mutate(p);
      return parseSearchParams(p, lookup);
    };
    expect(bad((p) => (p.delete('leg2'), p.delete('leg3')))).toBeNull(); // multi-city needs two flights
    expect(bad((p) => p.set('leg2', 'LIS-PAR-2026-W41'))).toBeNull(); // leaves before flight 1
    expect(bad((p) => p.set('leg3', 'PAR-SFO-2026-W44'))).toBeNull(); // leaves before flight 2
    expect(bad((p) => p.set('leg2', 'LIS-LIS-2026-W45'))).toBeNull(); // same city
    expect(bad((p) => p.set('leg2', 'LIS-ZZZ-2026-W45'))).toBeNull(); // unknown city
    expect(bad((p) => p.set('leg2', 'nonsense'))).toBeNull();
    expect(bad((p) => p.set('leg2', 'LIS-PAR-2026-W45'))).not.toBeNull();
  });

  it('allows the next flight in the same week, and an open-jaw (a flight that does not start where the last ended)', () => {
    const same: SearchQuery = { ...multi(), extraLegs: [{ from: par, to: lis, week: w('2026-W43') }] };
    expect(parseSearchParams(toSearchParams(same), lookup)?.extraLegs[0].week.isoWeek).toBe(43);
  });

  it('allows at most four flights in total', () => {
    const p = toSearchParams(multi());
    p.set('leg4', 'SFO-LIS-2026-W49');
    p.set('leg5', 'LIS-PAR-2026-W50'); // a fifth is simply never read
    expect(parseSearchParams(p, lookup)?.extraLegs).toHaveLength(3);
  });
});
