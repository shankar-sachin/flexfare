import type { BookRef, Depth, NightsRange, Segment, StayPreference, Week, WeekFare } from '../../../src/shared/types.js';

export interface NormalizedQuery {
  from: string; // IATA city code
  to: string;
  departWeek: Week;
  returnWeek: Week | null;
  travelers: number;
  cabin: 'economy' | 'premium' | 'business';
  /** Used by providers that can only price a few day combinations (they pick the ones that fit best). */
  stay?: StayPreference;
  customStay?: NightsRange | null;
  depth?: Depth;
}

export interface FareCandidate {
  id: string; // stable hash of origin|dest|out|back|airline|flightNo
  originAirport: string;
  destAirport: string;
  isNearby: boolean;
  nearbyTransferMinutes: number;
  outDate: string;
  backDate: string | null;
  price: number; // USD, round trip (or one way when backDate is null), total for 1 adult
  airline: string; // display name or code
  flightNumber?: string;
  stopsOut: number;
  stopsBack: number | null;
  minutesOut: number;
  minutesBack: number | null;
  departAt?: string;
  /** Real flight details for the outbound leg, when the provider has them. */
  outSegments?: Segment[];
  outLayovers?: string[];
  longestLayoverMinutes?: number;
  aviasalesPath?: string;
  /** What a direct checkout lookup needs (unsigned; the pipeline signs it). */
  book?: Omit<BookRef, 'sig'>;
  foundAt: string; // ISO
}

/** Cheapest fare per (out day, back day) in the chosen weeks: powers the day pickers. */
export interface DayGridCell {
  outDate: string;
  backDate: string | null;
  price: number;
}

export interface SearchResult {
  candidates: FareCandidate[];
  grid: DayGridCell[];
  pairsChecked: number;
  sample: boolean;
}

/** One search a planner asked for, and what came back (small enough to hand to a model). */
export interface LiveSearchRequest {
  outDate: string;
  backDate?: string | null;
  /** "main" or a nearby airport code. */
  destination: string;
}
export type LiveSearchReply =
  | { error: string }
  | {
      found: number;
      note?: string;
      cheapestNonstopUsd: number | null;
      options: { priceUsd: number; stops: number; duration: string; airlines: string }[];
    };
/** A search the planner steers: it picks the day combinations, the provider enforces the rules and the budget. */
export interface LiveSearch {
  budget: number;
  searchesStarted(): number;
  run(req: LiveSearchRequest): Promise<LiveSearchReply>;
  result(): Promise<SearchResult>;
}

export interface FareProvider {
  searchWeeks(q: NormalizedQuery): Promise<SearchResult>;
  /** Present on live-search providers (SerpApi): lets Claude choose which day combinations to price. */
  startLive?(q: NormalizedQuery): Promise<LiveSearch>;
  weekLows(from: string, to: string, weeks: Week[]): Promise<WeekFare[]>;
}
