// Deterministic fake fares for local dev, tests and demos. Seeded by route + date so the
// same query always returns the same numbers. Everything it returns is flagged `sample`.
import { createHash } from 'node:crypto';
import type { Week, WeekFare } from '../../../src/shared/types.js';
import { nearbyFor } from '../../../src/shared/nearby.js';
import type { DayGridCell, FareCandidate, FareProvider, NormalizedQuery, SearchResult } from './types.js';

const AIRPORTS: Record<string, string[]> = {
  SFO: ['SFO', 'OAK', 'SJC'], LAX: ['LAX', 'BUR', 'LGB', 'SNA'], NYC: ['JFK', 'EWR', 'LGA'],
  CHI: ['ORD', 'MDW'], LON: ['LHR', 'LGW', 'STN'], PAR: ['CDG', 'ORY'], TYO: ['HND', 'NRT'],
  MEX: ['MEX', 'NLU'], WAS: ['IAD', 'DCA', 'BWI'], MIL: ['MXP', 'LIN', 'BGY'],
};
const AIRLINES = ['Northwind Air', 'Atlantica', 'Blue Meridian', 'Iberico', 'Pacific Link'];
// Tue/Wed cheapest, Fri/Sun dearest (Mon..Sun).
const DOW_FACTOR = [1.05, 0.92, 0.95, 1.02, 1.18, 1.08, 1.15];

const airportsOf = (code: string) => AIRPORTS[code] ?? [code];

function seeded(key: string): () => number {
  const seed = createHash('sha256').update(key).digest().readUInt32LE(0);
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const basePrice = (from: string, to: string) => 260 + Math.floor(seeded(`base|${from}|${to}`)() * 520);

export const simulatedProvider: FareProvider = {
  async searchWeeks(q: NormalizedQuery): Promise<SearchResult> {
    const base = basePrice(q.from, q.to);
    const back = q.returnWeek;
    const grid: DayGridCell[] = [];
    for (let o = 0; o < 7; o++) {
      for (let b = 0; b < (back ? 7 : 1); b++) {
        const outDate = addDays(q.departWeek.start, o);
        const backDate = back ? addDays(back.start, b) : null;
        const noise = 0.9 + seeded(`g|${q.from}|${q.to}|${outDate}|${backDate}`)() * 0.25;
        const f = back ? (DOW_FACTOR[o] + DOW_FACTOR[b]) / 2 : DOW_FACTOR[o];
        grid.push({ outDate, backDate, price: Math.round(base * f * noise) });
      }
    }

    const dests: { airport: string; nearby: boolean; minutes: number }[] = [
      ...airportsOf(q.to).map((airport) => ({ airport, nearby: false, minutes: 0 })),
      ...nearbyFor(q.to).map((n) => ({ airport: n.airport, nearby: true, minutes: n.minutes })),
    ];
    const cheapest = [...grid].sort((a, b) => a.price - b.price).slice(0, 4);
    const foundAt = new Date().toISOString();
    const candidates: FareCandidate[] = [];

    for (const origin of airportsOf(q.from)) {
      for (const dest of dests) {
        for (const cell of cheapest) {
          const rnd = seeded(`c|${origin}|${dest.airport}|${cell.outDate}|${cell.backDate}`);
          const stopsOut = Math.floor(rnd() * 3);
          const stopsBack = back ? Math.floor(rnd() * 3) : null;
          const airline = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
          const airportBump = origin === airportsOf(q.from)[0] ? 1.06 : 0.98;
          const nearbyDiscount = dest.nearby ? 0.82 : 1;
          const stopDiscount = 1 - stopsOut * 0.07;
          const price = Math.max(120, Math.round(cell.price * airportBump * nearbyDiscount * stopDiscount * (0.95 + rnd() * 0.12)));
          const hours = 6 + Math.floor(rnd() * 5) + stopsOut * 3;
          const minutesOut = hours * 60 + Math.floor(rnd() * 50);
          const minutesBack = back ? minutesOut + Math.floor((rnd() - 0.3) * 120) : null;
          candidates.push({
            id: createHash('sha1').update(`${origin}|${dest.airport}|${cell.outDate}|${cell.backDate}|${airline}`).digest('hex').slice(0, 12),
            originAirport: origin,
            destAirport: dest.airport,
            isNearby: dest.nearby,
            nearbyTransferMinutes: dest.minutes,
            outDate: cell.outDate,
            backDate: cell.backDate,
            price,
            airline,
            stopsOut,
            stopsBack,
            minutesOut,
            minutesBack,
            foundAt,
          });
        }
      }
    }
    return { candidates, grid, pairsChecked: grid.length, sample: true };
  },

  async weekLows(from: string, to: string, weeks: Week[]): Promise<WeekFare[]> {
    const base = basePrice(from, to);
    return weeks.map((w) => ({
      isoWeek: w.isoWeek,
      lowest: Math.round(base * (0.8 + seeded(`w|${from}|${to}|${w.start}`)() * 0.55)),
    }));
  },
};
