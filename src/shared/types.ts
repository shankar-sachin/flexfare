// Core domain types for flexfare.
// The whole product is "city → city, week → week": users never pick airports or exact dates.

export interface City {
  code: string; // IATA city code, e.g. "SFO", "NYC", "LON"
  name: string; // "San Francisco"
  country?: string; // "United States"
  airports: string[]; // IATA codes searched for this city, e.g. ["SFO", "OAK", "SJC"]
  /** Nearby airports that can still get you there by ground transport. */
  nearby?: { airport: string; city: string; transfer: string }[];
}

/** An ISO week (Mon–Sun). */
export interface Week {
  isoWeek: number; // 1–53
  year: number;
  start: string; // ISO date of the Monday, "2026-10-19"
  end: string; // ISO date of the Sunday
  label: string; // "Oct 19 – 25"
}

export type StayPreference = 'cheapest' | 'range' | 'about-two-weeks' | 'exact';
export type Priority = 'price' | 'balance' | 'speed';

export interface SearchQuery {
  from: City;
  to: City;
  departWeek: Week;
  returnWeek: Week | null; // null = one-way
  travelers: number;
  cabin: 'economy' | 'premium' | 'business';
  stay: StayPreference;
  priority: Priority;
}

/** Lowest fare seen for a departure week (powers the week picker bars + results chart). */
export interface WeekFare {
  isoWeek: number;
  lowest: number;
}

export interface Segment {
  from: string; // "Oakland (OAK)"
  to: string;
  depart: string; // local time "06:10"
  arrive: string; // "04:50+1"
  flight: string; // "NW 412"
  carrier: string;
  duration: string; // "5h 35m"
  aircraft?: string;
}

export interface Leg {
  date: string; // ISO date
  totalDuration: string;
  stops?: number; // 0 = nonstop. Set even when `segments` is empty.
  departAt?: string; // ISO local datetime, when the provider gives it
  /** Empty when the fare source only gives a summary (the UI then shows a one-line summary + find links). */
  segments: Segment[];
  layovers: string[]; // human text between segments, length = segments.length - 1
}

export interface DayFare {
  date: string; // ISO date
  delta: number; // $ over the cheapest day in that week (0 = cheapest)
}

export interface CuratedRoute {
  id: string;
  fit: number; // 0–100 AI fit score
  price: number; // USD per adult (round trip, or one way when there is no return)
  totalMinutes: number; // outbound door-to-door minutes, used for "Fastest" sort
  carrier: string;
  fromAirport: string;
  toAirport: string;
  via: string; // "nonstop" | "1 stop · BOS"
  outDate: string; // ISO date
  backDate: string | null;
  duration: string; // "14h 40m"
  nights: number;
  badge?: 'Best fit' | 'Fastest' | 'Lowest fare' | 'Nearby arrival';
  warning?: string; // "Long layover", "+ 2h 50m train"
  why: string; // one-sentence AI rationale shown on the card
  reasons: string[]; // longer rationale on the detail page
  scores: { label: string; value: number }[];
  outbound: Leg;
  inbound: Leg | null;
  outDayFares: DayFare[]; // 7 entries, Mon–Sun of departWeek
  backDayFares: DayFare[]; // 7 entries, Mon–Sun of returnWeek
  /** Where to go find/book this flight. flexfare doesn't sell tickets. */
  links: FindLinks;
  priceFoundAt?: string; // ISO timestamp the fare was last seen
}

export interface FindLinks {
  googleFlights: string;
  skyscanner: string;
  aviasales?: string;
}

export interface CurationResult {
  headline: string; // "Leave on a Tuesday from Oakland…"
  summary: string; // short paragraph from the AI
  combosChecked: number;
  /** True when the AI step failed and routes are ranked by the deterministic score. */
  aiFallback?: boolean;
  /** True for demo or simulated fares. The UI labels these "sample data". */
  sample?: boolean;
  /** Plain-language note, e.g. "Few fares cached for these weeks; check the links for live prices." */
  dataNote?: string;
  quota?: { used: number; limit: number };
  weekFares: WeekFare[];
  routes: CuratedRoute[];
}
