import { describe, expect, it } from 'vitest';
import { parseIsoWeek } from '../../../src/shared/weeks';
import { pickPairs } from './pairs';

const out = parseIsoWeek('2026-W43')!; // Mon Oct 19 - Sun Oct 25
const back = parseIsoWeek('2026-W45')!; // Mon Nov 2 - Sun Nov 8
const nightsOf = (p: { outDate: string; backDate: string | null }) => (Date.parse(p.backDate!) - Date.parse(p.outDate)) / 86400000;

describe('pickPairs', () => {
  it('returns the requested number of distinct pairs, all inside the chosen weeks', () => {
    const pairs = pickPairs(out, back, 'cheapest', 5);
    expect(pairs).toHaveLength(5);
    expect(new Set(pairs.map((p) => `${p.outDate}|${p.backDate}`)).size).toBe(5);
    for (const p of pairs) {
      expect(p.outDate >= out.start && p.outDate <= out.end).toBe(true);
      expect(p.backDate! >= back.start && p.backDate! <= back.end).toBe(true);
    }
  });

  it('spreads across different days instead of repeating the same one', () => {
    const pairs = pickPairs(out, back, 'cheapest', 3);
    expect(new Set(pairs.map((p) => p.outDate)).size).toBe(3);
    expect(new Set(pairs.map((p) => p.backDate)).size).toBe(3);
  });

  it('starts with the usually cheaper weekdays (Tue/Wed)', () => {
    const [first] = pickPairs(out, back, 'cheapest', 3);
    expect(['2026-10-20', '2026-10-21']).toContain(first.outDate);
    expect(['2026-11-03', '2026-11-04']).toContain(first.backDate);
  });

  it('prefers day combinations that fit the stay length', () => {
    // weeks 2 apart: nights run 8..20. "about two weeks" should land close to 14.
    const pairs = pickPairs(out, back, 'about-two-weeks', 3);
    for (const p of pairs) expect(Math.abs(nightsOf(p) - 14)).toBeLessThanOrEqual(3);
    // a 10-16 night range keeps every pick inside it
    for (const p of pickPairs(out, back, 'range', 3)) {
      expect(nightsOf(p)).toBeGreaterThanOrEqual(10);
      expect(nightsOf(p)).toBeLessThanOrEqual(16);
    }
  });

  it('handles one-way searches', () => {
    const pairs = pickPairs(out, null, 'cheapest', 3);
    expect(pairs).toHaveLength(3);
    expect(pairs.every((p) => p.backDate === null)).toBe(true);
    expect(pairs[0].outDate >= out.start).toBe(true);
  });

  it('never returns more than exist, and is deterministic', () => {
    expect(pickPairs(out, null, 'cheapest', 20)).toHaveLength(7);
    expect(pickPairs(out, back, 'range', 4)).toEqual(pickPairs(out, back, 'range', 4));
  });
});
