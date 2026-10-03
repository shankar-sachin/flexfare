import { describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../../src/shared/weeks';
import { makeSerpApiProvider, parseSerp, type SerpDeps, type SerpOption } from './serpapi';
import type { NormalizedQuery } from './types';

// Shaped like SerpApi's google_flights response (fields we use).
const flight = (id1: string, name1: string, t1: string, id2: string, name2: string, t2: string, dur: number, airline: string, no: string) => ({
  departure_airport: { name: name1, id: id1, time: t1 }, arrival_airport: { name: name2, id: id2, time: t2 },
  duration: dur, airline, flight_number: no, airplane: 'Airbus A330',
});
const RESPONSE = {
  best_flights: [
    {
      flights: [
        flight('SFO', 'San Francisco International Airport', '2026-10-20 12:45', 'IAD', 'Washington Dulles International Airport', '2026-10-20 20:50', 295, 'United', 'UA 238'),
        flight('IAD', 'Washington Dulles International Airport', '2026-10-20 22:10', 'LIS', 'Humberto Delgado Airport', '2026-10-21 10:30', 440, 'Lufthansa', 'LH 7010'),
      ],
      layovers: [{ duration: 80, name: 'Washington Dulles International Airport', id: 'IAD' }],
      total_duration: 825, price: 1219,
    },
    {
      flights: [flight('SFO', 'San Francisco International Airport', '2026-10-20 15:00', 'LIS', 'Humberto Delgado Airport', '2026-10-21 09:25', 625, 'TAP Air Portugal', 'TP 233')],
      layovers: [], total_duration: 625, price: 1450,
    },
  ],
  other_flights: [
    {
      flights: [
        flight('OAK', 'Oakland International Airport', '2026-10-20 06:00', 'JFK', 'John F. Kennedy International Airport', '2026-10-20 14:30', 330, 'JetBlue', 'B6 416'),
        flight('JFK', 'John F. Kennedy International Airport', '2026-10-20 21:30', 'LIS', 'Humberto Delgado Airport', '2026-10-21 09:40', 430, 'JetBlue', 'B6 719'),
      ],
      layovers: [{ duration: 420, name: 'John F. Kennedy International Airport', id: 'JFK' }],
      total_duration: 1180, price: 960,
    },
    { flights: [], total_duration: 100, price: 500 }, // no flights: skipped
    { flights: [flight('SFO', 'x', '2026-10-20 10:00', 'LIS', 'y', '2026-10-20 12:00', 120, 'A', 'A 1')], total_duration: 120 }, // no price: skipped
  ],
};

const week = (w: string) => parseIsoWeek(w)!;
const query = (over: Partial<NormalizedQuery> = {}): NormalizedQuery => ({
  from: 'SFO', to: 'BER', departWeek: week('2026-W43'), returnWeek: week('2026-W45'), travelers: 1, cabin: 'economy', stay: 'range', depth: 'regular', ...over,
});

/** Fake services so no network, Firestore or credits are touched. */
function setup(over: Partial<SerpDeps> & { respond?: (url: URL) => Response } = {}) {
  const store = new Map<string, unknown>();
  const urls: URL[] = [];
  const reserve = vi.fn(async (_n: number) => undefined);
  const refund = vi.fn(async (_n: number) => undefined);
  const fetchFn = vi.fn(async (u: string | URL | Request) => {
    const url = new URL(String(u));
    urls.push(url);
    return over.respond ? over.respond(url) : new Response(JSON.stringify(RESPONSE), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = makeSerpApiProvider({
    fetchFn,
    cacheGet: (async (_c: string, key: string) => (store.has(key) ? store.get(key) : null)) as SerpDeps['cacheGet'],
    cacheSet: async (_c, key, value) => void store.set(key, value),
    reserve, refund,
    airports: async (c) => ({ SFO: ['SFO', 'OAK', 'SJC'], LIS: ['LIS'], BER: ['BER'], NYC: ['JFK', 'EWR', 'LGA'] })[c] ?? [c],
    apiKey: () => 'test-key',
    now: () => new Date('2026-10-01T12:00:00Z'),
    ...over,
  });
  return { provider, urls, store, reserve, refund, fetchFn };
}

describe('parseSerp', () => {
  it('keeps real options and skips ones without flights or a price', () => {
    const opts = parseSerp(RESPONSE);
    expect(opts).toHaveLength(3);
    expect(opts[0]).toMatchObject({ price: 1219, totalDuration: 825 });
    expect(opts[0].flights.map((f) => f.flightNumber)).toEqual(['UA 238', 'LH 7010']);
    expect(opts[0].layovers).toEqual([{ duration: 80, name: 'Washington Dulles International Airport', id: 'IAD' }]);
  });
  it('copes with an empty response', () => {
    expect(parseSerp({})).toEqual([]);
  });
});

describe('serpapi provider: requests', () => {
  it('searches all of the cities airports for each of 3 day combinations, one credit each', async () => {
    const { provider, urls, reserve } = setup();
    const r = await provider.searchWeeks(query());
    expect(urls).toHaveLength(3);
    expect(reserve).toHaveBeenCalledWith(3);
    expect(r.pairsChecked).toBe(3);
    for (const u of urls) {
      const p = u.searchParams;
      expect(u.origin + u.pathname).toBe('https://serpapi.com/search.json');
      expect(p.get('engine')).toBe('google_flights');
      expect(p.get('departure_id')).toBe('SFO,OAK,SJC');
      expect(p.get('arrival_id')).toBe('BER');
      expect(p.get('type')).toBe('1');
      expect(p.get('adults')).toBe('1');
      expect(p.get('currency')).toBe('USD');
      expect(p.get('travel_class')).toBe('1');
      expect(p.get('api_key')).toBe('test-key');
      expect(p.get('return_date')! > p.get('outbound_date')!).toBe(true);
    }
    expect(new Set(urls.map((u) => u.searchParams.get('outbound_date'))).size).toBe(3);
  });

  it('adds one extra search for a nearby arrival (Lisbon -> Porto)', async () => {
    const { provider, urls, reserve } = setup();
    const r = await provider.searchWeeks(query({ to: 'LIS' }));
    expect(urls).toHaveLength(4);
    expect(reserve).toHaveBeenCalledWith(4);
    const nearby = urls.filter((u) => u.searchParams.get('arrival_id') === 'OPO');
    expect(nearby).toHaveLength(1);
    expect(r.candidates.some((c) => c.isNearby && c.nearbyTransferMinutes === 170)).toBe(true);
    expect(r.candidates.some((c) => !c.isNearby)).toBe(true);
  });

  it('a deep search prices more combinations', async () => {
    const { provider, urls } = setup();
    await provider.searchWeeks(query({ depth: 'deep' }));
    expect(urls).toHaveLength(5);
  });

  it('one-way searches use type 2 and no return date', async () => {
    const { provider, urls } = setup();
    await provider.searchWeeks(query({ returnWeek: null }));
    expect(urls[0].searchParams.get('type')).toBe('2');
    expect(urls[0].searchParams.has('return_date')).toBe(false);
  });

  it('passes the cabin through, so the prices match what the user chose', async () => {
    const { provider, urls } = setup();
    await provider.searchWeeks(query({ cabin: 'business' }));
    expect(urls[0].searchParams.get('travel_class')).toBe('3');
  });

  it('refuses to run without a key', async () => {
    const { provider } = setup({ apiKey: () => undefined });
    await expect(provider.searchWeeks(query())).rejects.toThrow(/SERPAPI_KEY/);
  });
});

describe('serpapi provider: results', () => {
  it('turns Google Flights options into candidates with real flight details', async () => {
    const { provider } = setup();
    const r = await provider.searchWeeks(query({ to: 'BER' }));
    const oneStop = r.candidates.find((c) => c.price === 1219)!;
    expect(oneStop).toMatchObject({
      originAirport: 'SFO', destAirport: 'LIS', airline: 'United + Lufthansa', stopsOut: 1, minutesOut: 825,
      stopsBack: null, minutesBack: null, isNearby: false, flightNumber: 'UA 238', longestLayoverMinutes: 80,
    });
    expect(oneStop.outSegments).toHaveLength(2);
    expect(oneStop.outSegments![0]).toMatchObject({ depart: '12:45', arrive: '20:50', flight: 'UA 238', carrier: 'United', duration: '4h 55m' });
    expect(oneStop.outSegments![1].arrive).toBe('10:30+1'); // lands the next day
    expect(oneStop.outLayovers).toEqual(['1h 20m in Washington Dulles International Airport (IAD)']);
    expect(oneStop.departAt).toBe('2026-10-20T12:45');
    const nonstop = r.candidates.find((c) => c.price === 1450)!;
    expect(nonstop).toMatchObject({ stopsOut: 0, airline: 'TAP Air Portugal', outLayovers: [] });
    expect(nonstop.longestLayoverMinutes).toBeUndefined();
    expect(r.sample).toBe(false);
  });

  it('builds the day grid from the cheapest price per day combination', async () => {
    const { provider } = setup();
    const r = await provider.searchWeeks(query());
    expect(r.grid).toHaveLength(3);
    expect(r.grid.every((g) => g.price === 960)).toBe(true); // cheapest option in the fixture
  });

  it('gives different candidates different ids', async () => {
    const { provider } = setup();
    const r = await provider.searchWeeks(query());
    expect(new Set(r.candidates.map((c) => c.id)).size).toBe(r.candidates.length);
  });

  it('reports no week-by-week bars, since pricing every week would cost a credit each', async () => {
    const { provider } = setup();
    expect(await provider.weekLows('SFO', 'LIS', [week('2026-W43')])).toEqual([]);
  });
});

describe('serpapi provider: credits, caching and failures', () => {
  it('does not spend credits again for searches it already has', async () => {
    const { provider, urls, reserve } = setup();
    await provider.searchWeeks(query());
    expect(urls).toHaveLength(3);
    urls.length = 0;
    await provider.searchWeeks(query());
    expect(urls).toHaveLength(0);
    expect(reserve).toHaveBeenLastCalledWith(0);
  });

  it('only charges for the searches that are not cached', async () => {
    const { provider, urls, reserve } = setup();
    await provider.searchWeeks(query({ depth: 'regular' })); // caches 3
    urls.length = 0;
    await provider.searchWeeks(query({ depth: 'deep' })); // 3 cached + 2 new
    expect(urls).toHaveLength(2);
    expect(reserve).toHaveBeenLastCalledWith(2);
  });

  it('stops before searching when the monthly credit limit is reached', async () => {
    const { provider, fetchFn } = setup({ reserve: async () => { throw new Error('limit'); } });
    await expect(provider.searchWeeks(query())).rejects.toThrow('limit');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('treats "no results" as an empty answer, not a failure', async () => {
    const { provider, refund } = setup({ respond: () => new Response(JSON.stringify({ error: "Google Flights hasn't returned any results for this query." }), { status: 200 }) });
    const r = await provider.searchWeeks(query());
    expect(r.candidates).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
  });

  it('throws and refunds when every search fails (bad key, outage)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider, refund } = setup({ respond: () => new Response(JSON.stringify({ error: 'Invalid API key.' }), { status: 401 }) });
    await expect(provider.searchWeeks(query())).rejects.toThrow(/unavailable/);
    expect(refund).toHaveBeenCalledWith(3);
  });

  it('keeps the results it got when only some searches fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let n = 0;
    const { provider, refund } = setup({ respond: () => (++n === 2 ? new Response('{"error":"boom"}', { status: 500 }) : new Response(JSON.stringify(RESPONSE), { status: 200 })) });
    const r = await provider.searchWeeks(query());
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(refund).toHaveBeenCalledWith(1);
  });

  it('does not cache failed searches, so they can be retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider, store } = setup({ respond: () => new Response('{"error":"boom"}', { status: 500 }) });
    await expect(provider.searchWeeks(query())).rejects.toThrow();
    expect(store.size).toBe(0);
  });

  it('survives a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider } = setup({ fetchFn: vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch });
    await expect(provider.searchWeeks(query())).rejects.toThrow(/unavailable/);
  });
});

// keep the type import used (compile-time check that cached options have the compact shape)
const _shape: SerpOption | null = null;
void _shape;
