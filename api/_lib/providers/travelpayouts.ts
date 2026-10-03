// Real fares from the Travelpayouts / Aviasales Data API (prices come from a cache of recent
// Aviasales searches, so they are estimates, not live availability).
// Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163
// NOTE: written against the docs, not yet exercised with a live token. Verify field names with a
// real response (fixtures go in ./__fixtures__) before relying on it.
import { createHash } from 'node:crypto';
import type { Week, WeekFare } from '../../../src/shared/types.js';
import { nearbyFor } from '../../../src/shared/nearby.js';
import type { DayGridCell, FareCandidate, FareProvider, NormalizedQuery, SearchResult } from './types.js';

const BASE = 'https://api.travelpayouts.com';
const MAX_DETAIL_CALLS = 12;
const CONCURRENCY = 4;

interface MatrixRow {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string | null;
  value: number;
  number_of_changes?: number;
  found_at?: string;
  actual?: boolean;
}

interface PriceRow {
  origin_airport?: string;
  destination_airport?: string;
  price: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

function token(): string {
  const t = process.env.TRAVELPAYOUTS_TOKEN;
  if (!t) throw new Error('TRAVELPAYOUTS_TOKEN is not set');
  return t;
}

async function getJson<T>(path: string, params: Record<string, string>, timeoutMs = 8000): Promise<T | null> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, { headers: { 'X-Access-Token': token(), Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error(`[travelpayouts] ${path} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[travelpayouts] ${path} failed`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Airline code -> name (static file, fetched once per warm function instance).
let airlineNames: Promise<Map<string, string>> | null = null;
function loadAirlines(): Promise<Map<string, string>> {
  airlineNames ??= (async () => {
    const map = new Map<string, string>();
    try {
      const res = await fetch(`${BASE}/data/en/airlines.json`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) for (const a of (await res.json()) as { code: string; name?: string }[]) if (a.name) map.set(a.code, a.name);
    } catch {
      /* fall back to codes */
    }
    return map;
  })();
  return airlineNames;
}

const thursday = (w: Week) => {
  const d = new Date(`${w.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
};
const inWeek = (date: string | null | undefined, w: Week | null) => !!date && !!w && date >= w.start && date <= w.end;
const day = (s: string | undefined) => (s ? s.slice(0, 10) : '');

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const mine = i++;
        out[mine] = await fn(items[mine]);
      }
    }),
  );
  return out;
}

export const travelpayoutsProvider: FareProvider = {
  async searchWeeks(q: NormalizedQuery): Promise<SearchResult> {
    const targets = [
      { code: q.to, nearby: false, minutes: 0 },
      ...nearbyFor(q.to).map((n) => ({ code: n.airport, nearby: true, minutes: n.minutes })),
    ];
    const grid = new Map<string, DayGridCell>();
    const cells: { target: (typeof targets)[number]; row: MatrixRow }[] = [];

    // 1. One matrix call per target covers all 49 day pairs (the API returns +/-3 days around each date).
    await Promise.all(
      targets.map(async (target) => {
        const params: Record<string, string> = {
          origin: q.from,
          destination: target.code,
          depart_date: thursday(q.departWeek),
          currency: 'usd',
          show_to_affiliates: 'true',
        };
        if (q.returnWeek) params.return_date = thursday(q.returnWeek);
        const res = await getJson<{ data?: MatrixRow[] }>('/v2/prices/week-matrix', params);
        for (const row of res?.data ?? []) {
          if (!inWeek(row.depart_date, q.departWeek)) continue;
          if (q.returnWeek && !inWeek(row.return_date, q.returnWeek)) continue;
          cells.push({ target, row });
          if (target.nearby) continue; // the day pickers follow the main city
          const key = `${row.depart_date}|${row.return_date ?? ''}`;
          const prev = grid.get(key);
          if (!prev || row.value < prev.price) {
            grid.set(key, { outDate: row.depart_date, backDate: q.returnWeek ? (row.return_date ?? null) : null, price: Math.round(row.value) });
          }
        }
      }),
    );

    // 2. Real flight details for the cheapest date pairs only.
    const cheapest = [...cells].sort((a, b) => a.row.value - b.row.value).slice(0, MAX_DETAIL_CALLS);
    const airlines = await loadAirlines();
    const candidates = new Map<string, FareCandidate>();
    const add = (r: PriceRow, target: (typeof targets)[number], fallbackFoundAt: string) => {
      const outDate = day(r.departure_at);
      const backDate = q.returnWeek ? day(r.return_at) || null : null;
      if (!inWeek(outDate, q.departWeek) || (q.returnWeek && !inWeek(backDate, q.returnWeek))) return;
      const originAirport = r.origin_airport ?? q.from;
      const destAirport = r.destination_airport ?? target.code;
      const airline = r.airline ? (airlines.get(r.airline) ?? r.airline) : 'Unknown airline';
      const id = createHash('sha1').update(`${originAirport}|${destAirport}|${outDate}|${backDate}|${r.airline}|${r.flight_number}`).digest('hex').slice(0, 12);
      const minutesOut = r.duration_to ?? r.duration ?? 0;
      if (!r.price || !minutesOut) return;
      candidates.set(id, {
        id, originAirport, destAirport, isNearby: target.nearby, nearbyTransferMinutes: target.minutes,
        outDate, backDate, price: Math.round(r.price), airline,
        flightNumber: r.flight_number ? `${r.airline ?? ''} ${r.flight_number}`.trim() : undefined,
        stopsOut: r.transfers ?? 0,
        stopsBack: q.returnWeek ? (r.return_transfers ?? 0) : null,
        minutesOut,
        minutesBack: q.returnWeek ? (r.duration_back ?? minutesOut) : null,
        departAt: r.departure_at, aviasalesPath: r.link, foundAt: fallbackFoundAt,
      });
    };

    await pool(cheapest, CONCURRENCY, async ({ target, row }) => {
      const params: Record<string, string> = {
        origin: q.from, destination: target.code, departure_at: row.depart_date,
        currency: 'usd', sorting: 'price', limit: '5', unique: 'false', one_way: q.returnWeek ? 'false' : 'true',
      };
      if (q.returnWeek && row.return_date) params.return_at = row.return_date;
      const res = await getJson<{ data?: PriceRow[] }>('/aviasales/v3/prices_for_dates', params);
      for (const r of res?.data ?? []) add(r, target, row.found_at ?? new Date().toISOString());
    });

    // 3. Thin data: widen to month level for each target and filter back to the chosen weeks.
    if (candidates.size < 3) {
      await Promise.all(
        targets.map(async (target) => {
          const params: Record<string, string> = {
            origin: q.from, destination: target.code, departure_at: q.departWeek.start.slice(0, 7),
            currency: 'usd', sorting: 'price', limit: '100', unique: 'false', one_way: q.returnWeek ? 'false' : 'true',
          };
          if (q.returnWeek) params.return_at = q.returnWeek.start.slice(0, 7);
          const res = await getJson<{ data?: PriceRow[] }>('/aviasales/v3/prices_for_dates', params);
          for (const r of res?.data ?? []) add(r, target, new Date().toISOString());
        }),
      );
    }

    return {
      candidates: [...candidates.values()],
      grid: [...grid.values()],
      pairsChecked: 49 * targets.length || 7 * targets.length,
      sample: false,
    };
  },

  async weekLows(from: string, to: string, weeks: Week[]): Promise<WeekFare[]> {
    const months = [...new Set(weeks.flatMap((w) => [w.start.slice(0, 7), w.end.slice(0, 7)]))];
    const lows = new Map<number, number>();
    await pool(months, CONCURRENCY, async (month) => {
      const res = await getJson<{ data?: PriceRow[] }>('/aviasales/v3/prices_for_dates', {
        origin: from, destination: to, departure_at: month, currency: 'usd', sorting: 'price', limit: '1000', unique: 'false',
      });
      for (const r of res?.data ?? []) {
        const d = day(r.departure_at);
        const w = weeks.find((x) => inWeek(d, x));
        if (w && r.price && r.price < (lows.get(w.isoWeek) ?? Infinity)) lows.set(w.isoWeek, Math.round(r.price));
      }
    });
    return weeks.flatMap((w) => (lows.has(w.isoWeek) ? [{ isoWeek: w.isoWeek, lowest: lows.get(w.isoWeek)! }] : []));
  },
};
