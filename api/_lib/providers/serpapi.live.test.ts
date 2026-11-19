import { describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../../src/shared/weeks';
import { makeSerpApiProvider, type SerpDeps } from './serpapi';
import type { NormalizedQuery } from './types';

const f = (from: string, to: string, t1: string, t2: string, dur: number, airline: string, no: string) => ({
  departure_airport: { name: from, id: from, time: t1 }, arrival_airport: { name: to, id: to, time: t2 }, duration: dur, airline, flight_number: no,
});
const RESPONSE = {
  best_flights: [{ flights: [f('SFO', 'BER', '2026-10-21 10:00', '2026-10-22 08:00', 840, 'Lufthansa', 'LH 455')], layovers: [], total_duration: 840, price: 900 }],
  other_flights: [
    {
      flights: [f('SFO', 'FRA', '2026-10-21 09:00', '2026-10-22 05:00', 600, 'United', 'UA 1'), f('FRA', 'BER', '2026-10-22 07:00', '2026-10-22 08:10', 70, 'Lufthansa', 'LH 2')],
      layovers: [{ duration: 120, name: 'Frankfurt', id: 'FRA' }], total_duration: 790, price: 650,
    },
  ],
};

const week = (w: string) => parseIsoWeek(w)!;
const query = (over: Partial<NormalizedQuery> = {}): NormalizedQuery => ({
  from: 'SFO', to: 'BER', departWeek: week('2026-W43'), returnWeek: week('2026-W45'), travelers: 1, cabin: 'economy', stay: 'about-two-weeks', depth: 'regular', ...over,
});

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
    airports: async (c) => ({ SFO: ['SFO', 'OAK', 'SJC'], BER: ['BER'], LIS: ['LIS'] })[c] ?? [c],
    apiKey: () => 'test-key',
    now: () => new Date('2026-10-01T12:00:00Z'),
    ...over,
  });
  return { provider, urls, store, reserve, refund, fetchFn };
}
const live = async (s: ReturnType<typeof setup>, q = query()) => s.provider.startLive!(q);

describe('serpapi startLive: what Claude may ask for', () => {
  it('has the same search budget as the fixed search: 3 regular, 5 deep, plus one per nearby arrival', async () => {
    expect((await live(setup())).budget).toBe(3);
    expect((await live(setup(), query({ depth: 'deep' }))).budget).toBe(5);
    expect((await live(setup(), query({ to: 'LIS' }))).budget).toBeGreaterThanOrEqual(3);
  });

  it('refuses dates outside the chosen weeks, without spending anything', async () => {
    const s = setup();
    const l = await live(s);
    const bad = [
      { outDate: '2026-10-26', backDate: '2026-11-04', destination: 'main' }, // out after the leave week
      { outDate: '2026-10-21', backDate: '2026-11-09', destination: 'main' }, // back after the return week
      { outDate: '2026-10-21', backDate: null, destination: 'main' }, // round trip needs a return
      { outDate: 'tomorrow', backDate: '2026-11-04', destination: 'main' },
    ];
    for (const r of bad) expect(await l.run(r), JSON.stringify(r)).toHaveProperty('error');
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
    expect(l.searchesStarted()).toBe(0);
  });

  it('refuses a return date on a one-way trip, and an unknown arrival airport', async () => {
    const s = setup();
    const oneWay = await live(s, query({ returnWeek: null }));
    expect(await oneWay.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' })).toHaveProperty('error');
    expect(await oneWay.run({ outDate: '2026-10-21', destination: 'XYZ' })).toHaveProperty('error');
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it('prices one combination for one credit, searching every airport of the origin city', async () => {
    const s = setup();
    const l = await live(s);
    const r = await l.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' });
    expect(s.reserve).toHaveBeenCalledWith(1);
    const p = s.urls[0].searchParams;
    expect(p.get('departure_id')).toBe('SFO,OAK,SJC');
    expect(p.get('arrival_id')).toBe('BER');
    expect(p.get('outbound_date')).toBe('2026-10-21');
    expect(p.get('return_date')).toBe('2026-11-04');
    expect(r).toMatchObject({ found: 2, cheapestNonstopUsd: 900 });
    if ('options' in r) expect(r.options.map((o) => [o.priceUsd, o.stops])).toEqual([[650, 1], [900, 0]]); // cheapest first
  });

  it('never pays twice for the same combination', async () => {
    const s = setup();
    const l = await live(s);
    const req = { outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' };
    await l.run(req);
    const again = await l.run(req);
    expect(again).toMatchObject({ note: expect.stringContaining('Already searched') });
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    expect(s.reserve).toHaveBeenCalledTimes(1);
    expect(l.searchesStarted()).toBe(1);
  });

  it('stops at the budget, even when the calls arrive together', async () => {
    const s = setup();
    const l = await live(s);
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const replies = await Promise.all(days.map((d) => l.run({ outDate: d, backDate: '2026-11-04', destination: 'main' })));
    expect(s.fetchFn).toHaveBeenCalledTimes(3);
    expect(replies.filter((r) => 'error' in r)).toHaveLength(2);
    expect(l.searchesStarted()).toBe(3);
  });

  it('uses the shared 24-hour cache without spending a credit', async () => {
    const s = setup();
    const first = await live(s);
    await first.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' });
    const second = await live(s); // a later search by someone else
    await second.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' });
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    expect(s.reserve).toHaveBeenCalledTimes(1);
  });

  it('hands the credit back and reports an error when SerpApi fails', async () => {
    const s = setup({ respond: () => new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const l = await live(s);
    expect(await l.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' })).toHaveProperty('error');
    expect(s.refund).toHaveBeenCalledWith(1);
    expect((await l.result()).candidates).toEqual([]);
  });

  it('builds the same kind of candidates as the fixed search, from only the combinations that were priced', async () => {
    const s = setup();
    const l = await live(s);
    await l.run({ outDate: '2026-10-21', backDate: '2026-11-04', destination: 'main' });
    await l.run({ outDate: '2026-10-22', backDate: '2026-11-05', destination: 'main' });
    const r = await l.result();
    expect(r.sample).toBe(false);
    expect(r.pairsChecked).toBe(2);
    expect(r.candidates).toHaveLength(4);
    expect(r.candidates[0]).toMatchObject({ outDate: '2026-10-21', backDate: '2026-11-04', stopsBack: null, price: 900 });
    expect(r.grid.map((g) => g.price)).toEqual([650, 650]);
  });
});
