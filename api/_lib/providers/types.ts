import type { Week, WeekFare } from '../../../src/shared/types.js';

export interface NormalizedQuery {
  from: string; // IATA city code
  to: string;
  departWeek: Week;
  returnWeek: Week | null;
  travelers: number;
  cabin: 'economy' | 'premium' | 'business';
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
  aviasalesPath?: string;
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

export interface FareProvider {
  searchWeeks(q: NormalizedQuery): Promise<SearchResult>;
  weekLows(from: string, to: string, weeks: Week[]): Promise<WeekFare[]>;
}
