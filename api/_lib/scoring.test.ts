import { describe, expect, it } from 'vitest';
import type { FareCandidate } from './providers/types';
import { dedupe, scoreCandidates, stayScore } from './scoring';

const cand = (o: Partial<FareCandidate> = {}): FareCandidate => ({
  id: Math.random().toString(36).slice(2), originAirport: 'OAK', destAirport: 'LIS', isNearby: false, nearbyTransferMinutes: 0,
  outDate: '2026-10-20', backDate: '2026-11-03', price: 500, airline: 'Atlantica', stopsOut: 1, stopsBack: 1,
  minutesOut: 800, minutesBack: 800, foundAt: '2026-10-01T00:00:00Z', ...o,
});
const prefs = { priority: 'balance' as const, stay: 'range' as const, hasReturn: true };

describe('stayScore', () => {
  it('rewards nights inside the range and penalises outside', () => {
    expect(stayScore('range', 12)).toBe(100);
    expect(stayScore('range', 8)).toBe(84);
    expect(stayScore('range', 18)).toBe(84);
    expect(stayScore('about-two-weeks', 14)).toBe(100);
    expect(stayScore('about-two-weeks', 10)).toBe(72);
    expect(stayScore('cheapest', 3)).toBe(100);
  });
});

describe('scoreCandidates', () => {
  it('computes facts the model can quote', () => {
    const nonstop = cand({ price: 612, stopsOut: 0, stopsBack: 0, minutesOut: 665, minutesBack: 700 });
    const cheap = cand({ price: 489 });
    const [first, second] = scoreCandidates([cheap, nonstop], prefs);
    const byPrice = (x: typeof first) => x.c.price;
    const c = [first, second].find((s) => byPrice(s) === 489)!;
    expect(c.facts.isCheapest).toBe(true);
    expect(c.facts.deltaVsCheapest).toBe(0);
    expect(c.facts.deltaVsNonstop).toBe(489 - 612);
    const n = [first, second].find((s) => byPrice(s) === 612)!;
    expect(n.facts.deltaVsCheapest).toBe(123);
    expect(n.facts.isFastest).toBe(true);
  });

  it('priority changes the ranking', () => {
    const cheapSlow = cand({ price: 400, stopsOut: 2, stopsBack: 2, minutesOut: 1300, minutesBack: 1300 });
    const dearFast = cand({ price: 700, stopsOut: 0, stopsBack: 0, minutesOut: 600, minutesBack: 600 });
    expect(scoreCandidates([cheapSlow, dearFast], { ...prefs, priority: 'price' })[0].c.price).toBe(400);
    expect(scoreCandidates([cheapSlow, dearFast], { ...prefs, priority: 'speed' })[0].c.price).toBe(700);
  });

  it('adds ground transfer time and a connection penalty for nearby arrivals', () => {
    const near = cand({ isNearby: true, nearbyTransferMinutes: 170 });
    const direct = cand({ price: 500 });
    const scored = scoreCandidates([near, direct], prefs);
    expect(scored.find((s) => s.c.isNearby)!.effMinutes).toBe(970);
    expect(scored.find((s) => s.c.isNearby)!.scores.conn).toBe(75);
  });

  it('handles one-way fares and empty input', () => {
    expect(scoreCandidates([], prefs)).toEqual([]);
    const [one] = scoreCandidates([cand({ backDate: null, stopsBack: null, minutesBack: null })], { ...prefs, hasReturn: false });
    expect(one.nights).toBe(0);
    expect(one.scores.stay).toBe(100);
  });

  it('keeps at most 15, best first', () => {
    const many = Array.from({ length: 30 }, (_, i) => cand({ price: 300 + i * 10, outDate: `2026-10-${String(10 + (i % 7)).padStart(2, '0')}` }));
    const out = scoreCandidates(many, prefs);
    expect(out.length).toBeLessThanOrEqual(15);
    expect(out[0].pre).toBeGreaterThanOrEqual(out[out.length - 1].pre);
  });
});

describe('dedupe', () => {
  it('keeps the cheapest of identical itineraries', () => {
    const a = cand({ price: 600 });
    const b = { ...a, id: 'other', price: 550 };
    expect(dedupe([a, b]).map((c) => c.price)).toEqual([550]);
  });

  it('does not merge different flights from the same airline on the same day', () => {
    const slow = cand({ price: 400, stopsOut: 2, minutesOut: 1300 });
    const fast = cand({ price: 700, stopsOut: 0, minutesOut: 600 });
    expect(dedupe([slow, fast])).toHaveLength(2);
  });
});
