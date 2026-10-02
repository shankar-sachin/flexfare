// Deterministic scoring that runs BEFORE the LLM. It ranks candidates and precomputes every
// comparison ("$123 cheaper than the nonstop") so the model never has to do arithmetic.
import type { Priority, StayPreference } from '../../src/shared/types.js';
import type { FareCandidate } from './providers/types.js';

export interface QueryPrefs {
  priority: Priority;
  stay: StayPreference;
  hasReturn: boolean;
}

export interface Scored {
  c: FareCandidate;
  nights: number;
  weekday: string;
  effMinutes: number; // average one-way travel time incl. ground transfer for nearby arrivals
  scores: { price: number; time: number; conn: number; stay: number };
  pre: number; // 0-100 weighted score
  facts: {
    deltaVsCheapest: number;
    deltaVsNonstop: number | null;
    minutesVsFastest: number;
    isCheapest: boolean;
    isFastest: boolean;
  };
}

const WEIGHTS: Record<Priority, { p: number; t: number; c: number; s: number }> = {
  price: { p: 0.55, t: 0.15, c: 0.15, s: 0.15 },
  balance: { p: 0.35, t: 0.25, c: 0.2, s: 0.2 },
  speed: { p: 0.15, t: 0.45, c: 0.25, s: 0.15 },
};
const CONN = [100, 85, 65, 45];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TOP_N = 10; // fewer candidates = smaller prompt (Groq's free tier allows ~8k tokens/minute)
export const DEEP_TOP_N = 12; // a Deep Search looks at a few more

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export function stayScore(stay: StayPreference, nights: number): number {
  switch (stay) {
    case 'range': return nights >= 10 && nights <= 16 ? 100 : clamp(100 - 8 * (nights < 10 ? 10 - nights : nights - 16));
    case 'about-two-weeks': return clamp(100 - 7 * Math.abs(nights - 14));
    default: return 100; // 'cheapest' ignores stay; 'exact' is always inside the picked weeks
  }
}

export function dedupe(cands: FareCandidate[]): FareCandidate[] {
  const best = new Map<string, FareCandidate>();
  for (const c of cands) {
    // Same flights only: one airline can fly the same day with different stops/durations.
    const k = [c.originAirport, c.destAirport, c.outDate, c.backDate, c.airline, c.flightNumber, c.stopsOut, c.stopsBack, c.minutesOut, c.minutesBack].join('|');
    const prev = best.get(k);
    if (!prev || c.price < prev.price) best.set(k, c);
  }
  return [...best.values()];
}

export function scoreCandidates(input: FareCandidate[], prefs: QueryPrefs, topN = TOP_N): Scored[] {
  const cands = dedupe(input);
  if (cands.length === 0) return [];
  const eff = (c: FareCandidate) => {
    const legs = [c.minutesOut, c.minutesBack].filter((m): m is number => m !== null);
    return legs.reduce((a, b) => a + b, 0) / legs.length + c.nearbyTransferMinutes;
  };
  const minPrice = Math.min(...cands.map((c) => c.price));
  const minMinutes = Math.min(...cands.map(eff));
  const nonstopMin = Math.min(...cands.filter((c) => c.stopsOut === 0 && (c.stopsBack ?? 0) === 0).map((c) => c.price), Infinity);
  const w = WEIGHTS[prefs.priority];

  const scored = cands.map<Scored>((c) => {
    const stops = [c.stopsOut, c.stopsBack].filter((s): s is number => s !== null);
    const avgStops = stops.reduce((a, b) => a + b, 0) / stops.length;
    const connBase = CONN[Math.min(3, Math.floor(avgStops))] * (1 - (avgStops % 1)) + CONN[Math.min(3, Math.floor(avgStops) + 1)] * (avgStops % 1);
    const nights = c.backDate ? dayDiff(c.outDate, c.backDate) : 0;
    const m = eff(c);
    const scores = {
      price: clamp((100 * minPrice) / c.price),
      time: clamp((100 * minMinutes) / m),
      conn: clamp(connBase - (c.isNearby ? 10 : 0)),
      stay: prefs.hasReturn ? stayScore(prefs.stay, nights) : 100,
    };
    return {
      c,
      nights,
      weekday: WEEKDAYS[new Date(`${c.outDate}T00:00:00Z`).getUTCDay()],
      effMinutes: Math.round(m),
      scores,
      pre: clamp(w.p * scores.price + w.t * scores.time + w.c * scores.conn + w.s * scores.stay),
      facts: {
        deltaVsCheapest: c.price - minPrice,
        deltaVsNonstop: Number.isFinite(nonstopMin) ? c.price - nonstopMin : null,
        minutesVsFastest: Math.round(m - minMinutes),
        isCheapest: c.price === minPrice,
        isFastest: Math.round(m) === Math.round(minMinutes),
      },
    };
  });
  return scored.sort((a, b) => b.pre - a.pre || a.c.price - b.c.price).slice(0, topN);
}

export const fmtMinutes = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
