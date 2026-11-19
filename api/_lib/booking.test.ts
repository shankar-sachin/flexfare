import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRef } from '../../src/shared/types';
import { CLICKOUT_URL, lookupCheckout } from './booking';

const base: Omit<BookRef, 'kind' | 'token'> = { dep: 'SEA', arr: 'HND', out: '2026-12-30', back: '2027-01-06', cabin: 'economy' };
const departure: BookRef = { ...base, kind: 'departure', token: 'dep-token-123456' };
const oneWay: BookRef = { ...base, back: null, kind: 'booking', token: 'book-token-123456' };

const flight = (no: string, from: string, to: string, time: string) => ({ flight_number: no, departure_airport: { id: from, time }, arrival_airport: { id: to } });
const RETURNS = {
  best_flights: [
    { price: 1500, booking_token: 'b-pricey', flights: [flight('DL 1', 'HND', 'SEA', '2027-01-06 10:00')] },
    { price: 1351, booking_token: 'b-cheap', flights: [flight('DL 198', 'HND', 'HNL', '2027-01-06 21:00'), flight('DL 359', 'HNL', 'SEA', '2027-01-06 14:07')] },
  ],
  other_flights: [{ price: 900, flights: [flight('XX 9', 'HND', 'SEA', '2027-01-06 09:00')] }], // no token: can't be booked
};
const opt = (seller: string, price: number, over: object = {}) => ({ together: { book_with: seller, price, booking_request: { url: CLICKOUT_URL, post_data: `u=${seller}${price}` } }, ...over });
const BOOKING = { booking_options: [opt('Delta', 1691), opt('Delta', 1351), opt('Delta', 1351), opt('Expedia', 1400)] };

function setup(responses: (object | number)[]) {
  const reserve = vi.fn(async (_n: number) => undefined);
  const refund = vi.fn(async (_n: number) => undefined);
  const urls: URL[] = [];
  const queue = [...responses];
  const fetchFn = vi.fn(async (u: string | URL | Request) => {
    urls.push(new URL(String(u)));
    const next = queue.shift()!;
    return typeof next === 'number' ? new Response('{"error":"boom"}', { status: next }) : new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { reserve, refund, urls, deps: { fetchFn, apiKey: () => 'key', reserve, refund } };
}

describe('lookupCheckout', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('round trip: picks the cheapest return flight, then lists the booking choices cheapest first', async () => {
    const s = setup([RETURNS, BOOKING]);
    const r = await lookupCheckout(departure, s.deps);
    expect(s.reserve).toHaveBeenCalledWith(2);
    expect(s.urls).toHaveLength(2);
    expect(s.urls[0].searchParams.get('departure_token')).toBe('dep-token-123456');
    expect(s.urls[1].searchParams.get('booking_token')).toBe('b-cheap'); // not the $1500 one, not the one without a token
    expect(r.returnFlight).toBe('DL 198 HND to HNL 21:00, DL 359 HNL to SEA 14:07');
    expect(r.choices.map((c) => [c.seller, c.price])).toEqual([['Delta', 1351], ['Expedia', 1400], ['Delta', 1691]]); // duplicate dropped
    expect(r.choices[0]).toEqual({ seller: 'Delta', price: 1351, url: CLICKOUT_URL, postData: 'u=Delta1351' });
    expect(s.refund).not.toHaveBeenCalled(); // both searches answered, so both credits stand
  });

  it('sends the same trip as the fare search: airports, dates, one adult, cabin, round trip', async () => {
    const s = setup([RETURNS, BOOKING]);
    await lookupCheckout({ ...departure, dep: 'SFO,OAK,SJC', cabin: 'business' }, s.deps);
    const p = s.urls[0].searchParams;
    expect(Object.fromEntries(['engine', 'departure_id', 'arrival_id', 'outbound_date', 'return_date', 'type', 'adults', 'travel_class', 'currency'].map((k) => [k, p.get(k)]))).toEqual({
      engine: 'google_flights', departure_id: 'SFO,OAK,SJC', arrival_id: 'HND', outbound_date: '2026-12-30', return_date: '2027-01-06', type: '1', adults: '1', travel_class: '3', currency: 'USD',
    });
    expect(p.get('api_key')).toBe('key');
  });

  it('one way: a single search with the booking token', async () => {
    const s = setup([BOOKING]);
    const r = await lookupCheckout(oneWay, s.deps);
    expect(s.reserve).toHaveBeenCalledWith(1);
    expect(s.urls).toHaveLength(1);
    expect(s.urls[0].searchParams.get('type')).toBe('2');
    expect(s.urls[0].searchParams.has('return_date')).toBe(false);
    expect(r.returnFlight).toBeUndefined();
    expect(r.choices.length).toBeGreaterThan(0);
  });

  it('only passes on booking forms that point at the known click-out address, and skips separate tickets and phone-only sellers', async () => {
    const s = setup([
      {
        booking_options: [
          opt('Evil', 100, { together: { book_with: 'Evil', price: 100, booking_request: { url: 'https://evil.example/x', post_data: 'u=1' } } }),
          opt('Split', 200, { separate_tickets: true }),
          { together: { book_with: 'Phone', price: 300, booking_phone: '+1 555' } },
          opt('Delta', 400),
        ],
      },
    ]);
    const r = await lookupCheckout(oneWay, s.deps);
    expect(r.choices.map((c) => c.seller)).toEqual(['Delta']);
  });

  it('keeps to five choices', async () => {
    const s = setup([{ booking_options: [1, 2, 3, 4, 5, 6, 7].map((n) => opt(`S${n}`, 100 + n)) }]);
    expect((await lookupCheckout(oneWay, s.deps)).choices).toHaveLength(5);
  });

  it('says the fare is gone when no return flight can be booked, and hands the credits back', async () => {
    const s = setup([{ best_flights: [], other_flights: [] }]);
    await expect(lookupCheckout(departure, s.deps)).rejects.toMatchObject({ status: 404, code: 'EXPIRED' });
    expect(s.refund).toHaveBeenCalledWith(1); // one search ran and answered; the other never ran
  });

  it('says so when there is no direct booking option', async () => {
    const s = setup([{ booking_options: [] }]);
    await expect(lookupCheckout(oneWay, s.deps)).rejects.toMatchObject({ status: 404, code: 'NO_BOOKING' });
  });

  it('refunds searches that errored, and reports a friendly 502', async () => {
    const first = setup([500]);
    await expect(lookupCheckout(departure, first.deps)).rejects.toMatchObject({ status: 502, code: 'UPSTREAM' });
    expect(first.refund).toHaveBeenCalledWith(2);
    const second = setup([RETURNS, 500]);
    await expect(lookupCheckout(departure, second.deps)).rejects.toMatchObject({ status: 502 });
    expect(second.refund).toHaveBeenCalledWith(1);
  });

  it('stops before any search when the monthly credit cap is reached', async () => {
    const s = setup([]);
    s.reserve.mockRejectedValueOnce(Object.assign(new Error('cap'), { status: 503 }));
    await expect(lookupCheckout(oneWay, s.deps)).rejects.toMatchObject({ status: 503 });
    expect(s.urls).toHaveLength(0);
  });

  it('is unavailable without a SerpApi key', async () => {
    const s = setup([]);
    await expect(lookupCheckout(oneWay, { ...s.deps, apiKey: () => undefined })).rejects.toMatchObject({ status: 503 });
    expect(s.reserve).not.toHaveBeenCalled();
  });
});
