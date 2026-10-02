import { describe, expect, it } from 'vitest';
import type { City, SearchQuery } from '../shared/types';
import { parseIsoWeek } from '../shared/weeks';
import { parseSearchParams, toSearchParams } from './queryUrl';

const sfo: City = { code: 'SFO', name: 'San Francisco', airports: ['SFO', 'OAK'] };
const lis: City = { code: 'LIS', name: 'Lisbon', airports: ['LIS'] };
const lookup = (c: string) => [sfo, lis].find((x) => x.code === c);
const base = (): SearchQuery => ({
  from: sfo, to: lis, departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!,
  travelers: 2, cabin: 'premium', stay: 'range', priority: 'speed',
});

describe('search url', () => {
  it('round-trips a round trip', () => {
    const q = base();
    expect(parseSearchParams(toSearchParams(q), lookup)).toEqual(q);
  });

  it('omits back for one-way and parses it back', () => {
    const q = { ...base(), returnWeek: null };
    const p = toSearchParams(q);
    expect(p.has('back')).toBe(false);
    expect(parseSearchParams(p, lookup)?.returnWeek).toBeNull();
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
    expect(bad((x) => x.set('out', 'nope'))).toBeNull();
  });
});
