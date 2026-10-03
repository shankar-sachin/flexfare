// Real Google Flights prices through SerpApi (https://serpapi.com/google-flights-api).
// Unlike a price cache, this is a live search, so it returns real flights with times, airlines, flight
// numbers and layovers. The catch: one search = one credit and prices ONE day combination, so each
// curation prices only the few combinations that fit the traveler best (see pairs.ts).
import { createHash } from 'node:crypto';
import type { Segment, Week, WeekFare } from '../../../src/shared/types.js';
import { airportsFor } from '../airports.js';
import { cacheGet, cacheSet, hashKey } from '../cache.js';
import { intEnv } from '../http.js';
import { nearbyFor } from '../nearby.js';
import { fmtMinutes } from '../scoring.js';
import { reserveCredits, refundCredits } from '../serpCredits.js';
import { pickPairs, type DatePair } from './pairs.js';
import type { DayGridCell, FareCandidate, FareProvider, NormalizedQuery, SearchResult } from './types.js';

const CACHE_TTL_MS = 24 * 3600_000; // fares for the same trip shared across users for a day
const TRAVEL_CLASS = { economy: '1', premium: '2', business: '3' } as const;

/** What we keep from one Google Flights option (small enough to cache). */
export interface SerpOption {
  price: number;
  totalDuration: number;
  flights: { from: { id: string; name: string; time: string }; to: { id: string; name: string; time: string }; duration: number; airline: string; flightNumber: string; airplane?: string }[];
  layovers: { duration: number; name: string; id: string }[];
}

interface RawFlight {
  departure_airport: { name: string; id: string; time: string };
  arrival_airport: { name: string; id: string; time: string };
  duration: number;
  airline: string;
  flight_number?: string;
  airplane?: string;
}
interface RawOption {
  flights?: RawFlight[];
  layovers?: { duration: number; name: string; id: string }[];
  total_duration?: number;
  price?: number;
}

/** Turns SerpApi's response into our compact options. Skips anything without a price or flights. */
export function parseSerp(json: { best_flights?: RawOption[]; other_flights?: RawOption[] }): SerpOption[] {
  return [...(json.best_flights ?? []), ...(json.other_flights ?? [])].flatMap((o) => {
    if (!o.flights?.length || !o.price || !o.total_duration) return [];
    return [
      {
        price: Math.round(o.price),
        totalDuration: o.total_duration,
        flights: o.flights.map((f) => ({
          from: f.departure_airport,
          to: f.arrival_airport,
          duration: f.duration,
          airline: f.airline,
          flightNumber: f.flight_number ?? '',
          airplane: f.airplane,
        })),
        layovers: (o.layovers ?? []).map((l) => ({ duration: l.duration, name: l.name, id: l.id })),
      },
    ];
  });
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);

function toSegments(o: SerpOption): { segments: Segment[]; layovers: string[] } {
  const segments = o.flights.map<Segment>((f) => {
    const plus = daysBetween(f.from.time, f.to.time);
    return {
      from: `${f.from.name} (${f.from.id})`,
      to: `${f.to.name} (${f.to.id})`,
      depart: f.from.time.slice(11, 16),
      arrive: `${f.to.time.slice(11, 16)}${plus > 0 ? `+${plus}` : ''}`,
      flight: f.flightNumber || '—',
      carrier: f.airline,
      duration: fmtMinutes(f.duration),
      aircraft: f.airplane,
    };
  });
  return { segments, layovers: o.layovers.map((l) => `${fmtMinutes(l.duration)} in ${l.name} (${l.id})`) };
}

interface Job {
  pair: DatePair;
  dest: { ids: string[]; nearby: boolean; minutes: number };
}

export interface SerpDeps {
  fetchFn?: typeof fetch;
  cacheGet?: <T>(collection: string, key: string, ttlMs: number) => Promise<T | null>;
  cacheSet?: (collection: string, key: string, value: unknown) => Promise<void>;
  reserve?: (n: number) => Promise<void>;
  refund?: (n: number) => Promise<void>;
  airports?: (city: string) => Promise<string[]>;
  apiKey?: () => string | undefined;
  now?: () => Date;
}

export function makeSerpApiProvider(deps: SerpDeps = {}): FareProvider {
  const fetchFn = deps.fetchFn ?? fetch;
  const get = deps.cacheGet ?? cacheGet;
  const set = deps.cacheSet ?? cacheSet;
  const reserve = deps.reserve ?? reserveCredits;
  const refund = deps.refund ?? refundCredits;
  const airports = deps.airports ?? airportsFor;
  const apiKey = deps.apiKey ?? (() => process.env.SERPAPI_KEY);
  const now = deps.now ?? (() => new Date());

  /** One Google Flights search. Returns null if SerpApi failed (so it can be reported), [] if just no flights. */
  async function search(origins: string[], job: Job, q: NormalizedQuery): Promise<SerpOption[] | null> {
    const params: Record<string, string> = {
      engine: 'google_flights',
      departure_id: origins.join(','),
      arrival_id: job.dest.ids.join(','),
      outbound_date: job.pair.outDate,
      type: job.pair.backDate ? '1' : '2',
      currency: 'USD',
      hl: 'en',
      gl: 'us',
      adults: '1', // fares are per adult everywhere in flexfare
      travel_class: TRAVEL_CLASS[q.cabin],
      api_key: apiKey() ?? '',
    };
    if (job.pair.backDate) params.return_date = job.pair.backDate;
    try {
      const res = await fetchFn(`https://serpapi.com/search.json?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(45000) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; best_flights?: RawOption[]; other_flights?: RawOption[] };
      if (json.error && /hasn't returned any results|no results|no flights/i.test(json.error)) return [];
      if (!res.ok || json.error) {
        console.error(`[serpapi] ${res.status}: ${String(json.error ?? '').slice(0, 200)}`);
        return null;
      }
      return parseSerp(json);
    } catch (err) {
      console.error('[serpapi] request failed', err instanceof Error ? err.message : err);
      return null;
    }
  }

  return {
    async searchWeeks(q: NormalizedQuery): Promise<SearchResult> {
      if (!apiKey()) throw new Error('SERPAPI_KEY is not set');
      const [origins, destIds] = await Promise.all([airports(q.from), airports(q.to)]);
      const n = q.depth === 'deep' ? intEnv('SERPAPI_DEEP_SEARCHES', 5) : intEnv('SERPAPI_REGULAR_SEARCHES', 3);
      const pairs = pickPairs(q.departWeek, q.returnWeek, q.stay ?? 'cheapest', n);

      const jobs: Job[] = pairs.map((pair) => ({ pair, dest: { ids: destIds, nearby: false, minutes: 0 } }));
      // One extra search for a nearby arrival (e.g. Porto for Lisbon), using the best-fitting day combination.
      for (const near of nearbyFor(q.to)) jobs.push({ pair: pairs[0], dest: { ids: [near.airport], nearby: true, minutes: near.minutes } });

      const keyOf = (j: Job) => hashKey(['serp', origins, j.dest.ids, j.pair.outDate, j.pair.backDate, q.cabin]);
      const cached = await Promise.all(jobs.map((j) => get<SerpOption[]>('serpFares', keyOf(j), CACHE_TTL_MS).catch(() => null)));
      const misses = jobs.filter((_, i) => cached[i] === null);
      await reserve(misses.length); // throws (503) rather than going past the monthly credit limit

      const fetched = new Map<Job, SerpOption[] | null>();
      await Promise.all(
        misses.map(async (j) => {
          const options = await search(origins, j, q);
          fetched.set(j, options);
          if (options !== null) await set('serpFares', keyOf(j), options).catch(() => undefined);
        }),
      );
      const failed = misses.filter((j) => fetched.get(j) === null).length;
      if (failed > 0) await refund(failed); // SerpApi didn't count searches that errored
      if (misses.length > 0 && failed === misses.length && misses.length === jobs.length) throw new Error('SerpApi unavailable');

      const foundAt = now().toISOString();
      const candidates: FareCandidate[] = [];
      const grid = new Map<string, DayGridCell>();
      jobs.forEach((job, i) => {
        const options = cached[i] ?? fetched.get(job) ?? [];
        for (const o of options) {
          const first = o.flights[0];
          const last = o.flights[o.flights.length - 1];
          const { segments, layovers } = toSegments(o);
          const airline = [...new Set(o.flights.map((f) => f.airline))].join(' + ');
          const longest = Math.max(0, ...o.layovers.map((l) => l.duration));
          candidates.push({
            id: createHash('sha1')
              .update([first.from.id, last.to.id, job.pair.outDate, job.pair.backDate, o.flights.map((f) => f.flightNumber).join('/'), o.price].join('|'))
              .digest('hex')
              .slice(0, 12),
            originAirport: first.from.id,
            destAirport: last.to.id,
            isNearby: job.dest.nearby,
            nearbyTransferMinutes: job.dest.minutes,
            outDate: job.pair.outDate,
            backDate: job.pair.backDate,
            price: o.price,
            airline,
            flightNumber: first.flightNumber || undefined,
            stopsOut: o.flights.length - 1,
            stopsBack: null, // Google lists the outbound first; the return is chosen on Google Flights
            minutesOut: o.totalDuration,
            minutesBack: null,
            departAt: first.from.time.replace(' ', 'T'),
            outSegments: segments,
            outLayovers: layovers,
            longestLayoverMinutes: longest || undefined,
            foundAt,
          });
          if (!job.dest.nearby) {
            const key = `${job.pair.outDate}|${job.pair.backDate ?? ''}`;
            const prev = grid.get(key);
            if (!prev || o.price < prev.price) grid.set(key, { outDate: job.pair.outDate, backDate: job.pair.backDate, price: o.price });
          }
        }
      });
      return { candidates, grid: [...grid.values()], pairsChecked: pairs.length, sample: false };
    },

    // Pricing every week would cost a credit per week, so the "from $X" bars aren't available with this source.
    async weekLows(_from: string, _to: string, _weeks: Week[]): Promise<WeekFare[]> {
      return [];
    },
  };
}

export const serpApiProvider = makeSerpApiProvider();
