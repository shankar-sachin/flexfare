import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../src/shared/weeks';
import type { FareCandidate, FareProvider, NormalizedQuery } from './providers/types';

const seen: NormalizedQuery[] = [];
const cand = (id: string, price: number, o: Partial<FareCandidate> = {}): FareCandidate => ({
  id, originAirport: 'SFO', destAirport: 'LIS', isNearby: false, nearbyTransferMinutes: 0, outDate: '2026-10-20', backDate: '2026-11-03',
  price, airline: 'United + Lufthansa', stopsOut: 1, stopsBack: null, minutesOut: 825, minutesBack: null, foundAt: '2026-10-01T12:00:00Z', ...o,
});
const provider: FareProvider = {
  async searchWeeks(q) {
    seen.push(q);
    return {
      candidates: [
        cand('a', 1219, {
          departAt: '2026-10-20T12:45',
          outSegments: [
            { from: 'San Francisco International Airport (SFO)', to: 'Dulles (IAD)', depart: '12:45', arrive: '20:50', flight: 'UA 238', carrier: 'United', duration: '4h 55m' },
            { from: 'Dulles (IAD)', to: 'Lisbon (LIS)', depart: '22:10', arrive: '10:30+1', flight: 'LH 7010', carrier: 'Lufthansa', duration: '7h 20m' },
          ],
          outLayovers: ['1h 20m in Dulles (IAD)'], longestLayoverMinutes: 80,
        }),
        cand('b', 960, { stopsOut: 1, outDate: '2026-10-21', longestLayoverMinutes: 420, outLayovers: ['7h 00m in JFK (JFK)'], minutesOut: 1180 }),
        cand('c', 1450, { stopsOut: 0, minutesOut: 625, outDate: '2026-10-22' }),
      ],
      grid: [], pairsChecked: 3, sample: false,
    };
  },
  async weekLows() {
    return [];
  },
};
vi.mock('./providers/index.js', () => ({ getProvider: () => provider }));
const { runCuration } = await import('./pipeline');

const q: NormalizedQuery = { from: 'SFO', to: 'LIS', departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!, travelers: 1, cabin: 'economy' };

describe('runCuration with a live-search provider', () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('tells the provider the stay preference and depth, so it prices the right day combinations', async () => {
    seen.length = 0;
    await runCuration(q, { stay: 'about-two-weeks', priority: 'price', depth: 'deep' });
    expect(seen[0]).toMatchObject({ stay: 'about-two-weeks', depth: 'deep' });
  });

  it('shows the real flight segments and layovers on the itinerary', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    const route = r.routes.find((x) => x.id === 'a')!;
    expect(route.outbound.segments).toHaveLength(2);
    expect(route.outbound.segments[0]).toMatchObject({ flight: 'UA 238', carrier: 'United', depart: '12:45' });
    expect(route.outbound.layovers).toEqual(['1h 20m in Dulles (IAD)']);
    expect(route.outbound.departAt).toBe('2026-10-20T12:45');
  });

  it('has no return leg when the return flight is not known, but keeps the return date and the round-trip price', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    for (const route of r.routes) {
      expect(route.inbound).toBeNull();
      expect(route.backDate).toBe('2026-11-03');
      expect(route.booking.find((b) => b.id === 'google-flights')?.url).toContain('google.com/travel/flights');
    }
  });

  it('offers the airline itself first (recommended), then comparison sites, from the real flight numbers', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    const route = r.routes.find((x) => x.id === 'a')!;
    expect(route.carriers).toEqual([{ code: 'UA', name: 'United' }, { code: 'LH', name: 'Lufthansa' }]);
    expect(route.booking.map((b) => b.id)).toEqual(['airline-UA', 'airline-LH', 'google-flights', 'skyscanner', 'expedia', 'kayak']);
    expect(route.booking[0]).toMatchObject({ kind: 'airline', recommended: true, prefilled: true, label: 'United Airlines' });
    expect(route.booking[0].url).toContain('united.com/en/us/fsr/choose-flights');
    expect(route.booking[0].url).toContain('f=SFO&t=LIS&d=2026-10-20&r=2026-11-03');
    expect(route.booking[1].recommended).toBeFalsy();
  });

  it('flags a long layover from the real layover time', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    expect(r.routes.find((x) => x.id === 'b')!.warning).toBe('Long layover (7h 00m)');
    expect(r.routes.find((x) => x.id === 'a')!.warning).toBeUndefined();
  });
});
