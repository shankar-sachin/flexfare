// Looks up a direct checkout for one priced flight through SerpApi's Google Flights booking options.
//   round trip: departure_token -> return flights (1 credit) -> booking_token -> booking options (1 credit)
//   one way:    booking_token -> booking options (1 credit)
// Each booking option carries a form (url + post_data) that the traveler's browser submits. Google's click-out
// answers with a redirect to the seller's own checkout page (checked on 2026-11-18 with a Delta round trip: it
// landed on delta.com/completepurchase/trip-summary with the fares to choose from).
import type { BookChoice, BookLookup, BookRef } from '../../src/shared/types.js';
import { HttpError } from './http.js';
import { refundCredits, reserveCredits } from './serpCredits.js';

/** The only address we let a booking form point at, so a bad response can never aim the form somewhere else. */
export const CLICKOUT_URL = 'https://www.google.com/travel/clk/f';
const TRAVEL_CLASS = { economy: '1', premium: '2', business: '3' } as const;
const MAX_CHOICES = 5;

export interface BookDeps {
  fetchFn?: typeof fetch;
  apiKey?: () => string | undefined;
  reserve?: (n: number) => Promise<void>;
  refund?: (n: number) => Promise<void>;
}

interface RawFlight {
  departure_airport?: { id?: string; time?: string };
  arrival_airport?: { id?: string };
  flight_number?: string;
}
interface RawOption {
  flights?: RawFlight[];
  price?: number;
  booking_token?: string;
}
interface RawBookingOption {
  together?: { book_with?: string; price?: number; booking_request?: { url?: string; post_data?: string } };
  separate_tickets?: boolean;
}
interface RawResponse {
  error?: string;
  best_flights?: RawOption[];
  other_flights?: RawOption[];
  booking_options?: RawBookingOption[];
}

/** "DL 198 HND to HNL 21:00, DL 359 HNL to SEA 14:07" */
const describeFlights = (o: RawOption) =>
  (o.flights ?? [])
    .map((f) => `${f.flight_number ?? 'Flight'} ${f.departure_airport?.id ?? '?'} to ${f.arrival_airport?.id ?? '?'}${f.departure_airport?.time ? ` ${f.departure_airport.time.slice(11, 16)}` : ''}`)
    .join(', ');

export async function lookupCheckout(ref: BookRef, deps: BookDeps = {}): Promise<BookLookup> {
  const fetchFn = deps.fetchFn ?? fetch;
  const key = (deps.apiKey ?? (() => process.env.SERPAPI_KEY))();
  if (!key) throw new HttpError(503, 'BUSY', 'Direct booking is not available right now.');
  const reserve = deps.reserve ?? reserveCredits;
  const refund = deps.refund ?? refundCredits;

  const total = ref.kind === 'departure' ? 2 : 1;
  await reserve(total); // throws 503 rather than going past the monthly credit limit
  let billed = 0;

  async function search(extra: Record<string, string>): Promise<RawResponse> {
    const params: Record<string, string> = {
      engine: 'google_flights', departure_id: ref.dep, arrival_id: ref.arr, outbound_date: ref.out, type: ref.back ? '1' : '2',
      currency: 'USD', hl: 'en', gl: 'us', adults: '1', travel_class: TRAVEL_CLASS[ref.cabin], ...extra, api_key: key as string,
    };
    if (ref.back) params.return_date = ref.back;
    let json: RawResponse;
    try {
      const res = await fetchFn(`https://serpapi.com/search.json?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(45000) });
      json = (await res.json().catch(() => ({}))) as RawResponse;
      if (!res.ok || json.error) throw new Error(String(json.error ?? res.status).slice(0, 200));
    } catch (err) {
      console.error('[booking] SerpApi request failed', err instanceof Error ? err.message : err);
      throw new HttpError(502, 'UPSTREAM', 'We could not reach the booking data just now. Please try again, or use the links below.');
    }
    billed++;
    return json;
  }

  try {
    let bookingToken = ref.token;
    let returnFlight: string | undefined;
    if (ref.kind === 'departure') {
      const back = await search({ departure_token: ref.token });
      // The price we showed is the cheapest round trip with this outbound flight, so take the cheapest return.
      const returns = [...(back.best_flights ?? []), ...(back.other_flights ?? [])].filter((o) => o.booking_token && o.price);
      if (returns.length === 0) throw new HttpError(404, 'EXPIRED', 'That fare is no longer available. Use the links below.');
      const cheapest = returns.reduce((a, b) => (b.price! < a.price! ? b : a));
      bookingToken = cheapest.booking_token!;
      returnFlight = describeFlights(cheapest);
    }

    const res = await search({ booking_token: bookingToken });
    const seen = new Set<string>();
    const choices: BookChoice[] = [];
    for (const o of res.booking_options ?? []) {
      const t = o.together;
      const req = t?.booking_request;
      if (o.separate_tickets || !t || typeof t.book_with !== 'string' || typeof t.price !== 'number' || !req?.post_data || req.url !== CLICKOUT_URL) continue;
      const id = `${t.book_with}|${t.price}`;
      if (seen.has(id)) continue;
      seen.add(id);
      choices.push({ seller: t.book_with, price: Math.round(t.price), url: CLICKOUT_URL, postData: req.post_data });
    }
    choices.sort((a, b) => a.price - b.price);
    if (choices.length === 0) throw new HttpError(404, 'NO_BOOKING', 'No direct booking link was available for that fare. Use the links below.');
    return { choices: choices.slice(0, MAX_CHOICES), ...(returnFlight && { returnFlight }) };
  } catch (err) {
    await refund(total - billed).catch(() => undefined); // SerpApi doesn't count searches that errored
    throw err;
  }
}
