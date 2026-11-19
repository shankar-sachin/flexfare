import { describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../../src/shared/weeks';
import { makeSerpApiProvider, parseSerp, type SerpDeps } from './serpapi';
import type { NormalizedQuery } from './types';

const f = (from: string, to: string, t1: string, t2: string, airline: string, no: string) => ({
  departure_airport: { name: from, id: from, time: t1 }, arrival_airport: { name: to, id: to, time: t2 }, duration: 600, airline, flight_number: no,
});
const roundTrip = { best_flights: [{ flights: [f('SEA', 'HND', '2026-12-30 11:00', '2026-12-31 14:00', 'Delta', 'DL 167')], layovers: [], total_duration: 600, price: 1351, departure_token: 'DEP-TOKEN-ABCDEFGH' }] };
const oneWay = { best_flights: [{ flights: [f('SEA', 'HND', '2026-12-30 11:00', '2026-12-31 14:00', 'Delta', 'DL 167')], layovers: [], total_duration: 600, price: 700, booking_token: 'BOOK-TOKEN-ABCDEFGH' }] };

describe('parseSerp: checkout tokens', () => {
  it('keeps a departure token for round trips and a booking token for one ways', () => {
    expect(parseSerp(roundTrip)[0].token).toEqual({ kind: 'departure', value: 'DEP-TOKEN-ABCDEFGH' });
    expect(parseSerp(oneWay)[0].token).toEqual({ kind: 'booking', value: 'BOOK-TOKEN-ABCDEFGH' });
  });

  it('leaves options without a token alone, so old cached fares still work', () => {
    const { departure_token: _drop, ...bare } = roundTrip.best_flights[0];
    expect(parseSerp({ best_flights: [bare] })[0].token).toBeUndefined();
  });
});

describe('serpapi startLive: checkout reference on each candidate', () => {
  it('records the airports, dates and cabin exactly as they were searched, so the lookup can repeat the search', async () => {
    const provider = makeSerpApiProvider({
      fetchFn: (async () => new Response(JSON.stringify(roundTrip), { status: 200 })) as unknown as typeof fetch,
      cacheGet: async () => null,
      cacheSet: async () => undefined,
      reserve: vi.fn(async () => undefined), refund: vi.fn(async () => undefined),
      airports: async (c) => ({ SEA: ['SEA'], TYO: ['HND', 'NRT'] })[c] ?? [c],
      apiKey: () => 'k', now: () => new Date('2026-11-18T12:00:00Z'),
    } satisfies SerpDeps);
    const q: NormalizedQuery = { from: 'SEA', to: 'TYO', departWeek: parseIsoWeek('2026-W53')!, returnWeek: parseIsoWeek('2027-W01')!, travelers: 1, cabin: 'premium', depth: 'regular' };
    const live = await provider.startLive!(q);
    await live.run({ outDate: '2026-12-30', backDate: '2027-01-06', destination: 'main' });
    const { candidates } = await live.result();
    expect(candidates[0].book).toEqual({ kind: 'departure', token: 'DEP-TOKEN-ABCDEFGH', dep: 'SEA', arr: 'HND,NRT', out: '2026-12-30', back: '2027-01-06', cabin: 'premium' });
  });
});
