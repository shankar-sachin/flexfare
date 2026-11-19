import type Anthropic from '@anthropic-ai/sdk';
import type { Scored } from './scoring.js';
import { fmtMinutes } from './scoring.js';
import type { NearbyAirport } from '../../src/shared/nearby.js';
import type { Depth, NightsRange, Priority, StayPreference } from '../../src/shared/types.js';
import { stayRange } from '../../src/shared/stay.js';

const BASE_PROMPT = `You are flexfare's route analyst. You are given flight candidates that were already found and scored. Choose the best 3 to 5 for this traveler and explain the trade-offs in plain, specific language.

Hard rules:
- Only pick candidates by their "id". Never invent a route, airline, time or price.
- Every dollar amount you write must come from the candidate data: a priceUsd, a deltaVsCheapestUsd, a deltaVsNonstopUsd, or the exact difference between the priceUsd of two candidates you picked. Do no other arithmetic with prices.
- Describe stops exactly as given: stopsOut / stopsBack of 0 means nonstop in that direction, anything higher means that many stops. Never call a pick nonstop or direct unless at least one direction has 0 stops, and say which direction.
- stopsBack and travelTimeBack are null when the return flight is not known yet (the traveler picks it later). Then say nothing about the return leg's stops or duration.
- Never mention how long a layover is; that is shown elsewhere. Do not write badges or warnings; the app adds those.
- No hype, no emoji, no exclamation marks. Prices are estimates, not live availability; never promise a fare.
- Say what the traveler gives up as well as what they gain, e.g. "$123 cheaper than the nonstop, about 3h 30m longer each way".
- The traveler's priority and stay length matter: weigh them, don't just copy the pre-score.
- fit is your overall score for that pick: a whole number from 0 to 100. Order picks best first.
- scores has four whole numbers from 0 to 100 (price, travelTime, connections, weeksFit). Start from the subScores in the candidate data and adjust a little if you disagree. Never use null, and never go above 100.
- headline: one sentence (max 140 chars) giving the single most useful insight. summary: 1-2 sentences (max 320 chars).
Return only JSON matching the schema.`;

const REGULAR = '\nThis is a regular search: choose 3 or 4 picks and keep every explanation to one or two short sentences.';
const DEEP =
  '\nThis is a Deep Search: the traveler wants a closer look. Compare all the candidates, choose 5 picks when there are that many, and use reasons to spell out the main trade-offs between the top picks (what each one gains and gives up).';

export const systemPrompt = (depth: Depth) => BASE_PROMPT + (depth === 'deep' ? DEEP : REGULAR);

export interface PromptInput {
  from: string;
  to: string;
  priority: Priority;
  stay: StayPreference;
  customStay?: NightsRange | null;
  hasReturn: boolean;
  pairsChecked: number;
  nearby: NearbyAirport[];
  candidates: Scored[];
}

export function buildUserMessage(p: PromptInput): string {
  const payload = {
    traveler: { from: p.from, to: p.to, priority: p.priority, stayPreference: p.stay, stayNights: p.hasReturn ? stayRange(p.stay, p.customStay) : null, roundTrip: p.hasReturn },
    dateCombinationsChecked: p.pairsChecked,
    nearbyArrivalOptions: p.nearby.map((n) => `${n.airport} (${n.city}) is a ${n.transfer} from the destination`),
    candidates: p.candidates.map((s) => ({
      id: s.c.id,
      route: `${s.c.originAirport} -> ${s.c.destAirport}`,
      airline: s.c.airline,
      outbound: `${s.weekday} ${s.c.outDate}`,
      returnDate: s.c.backDate,
      nights: s.nights || null,
      priceUsd: s.c.price,
      stopsOut: s.c.stopsOut,
      stopsBack: s.c.stopsBack,
      travelTimeOut: fmtMinutes(s.c.minutesOut),
      travelTimeBack: s.c.minutesBack === null ? null : fmtMinutes(s.c.minutesBack),
      groundTransfer: s.c.isNearby ? `${s.c.nearbyTransferMinutes} min each way` : null,
      deltaVsCheapestUsd: s.facts.deltaVsCheapest,
      deltaVsNonstopUsd: s.facts.deltaVsNonstop,
      extraTimeVsFastest: fmtMinutes(s.facts.minutesVsFastest),
      isCheapest: s.facts.isCheapest,
      isFastest: s.facts.isFastest,
      preScore: s.pre,
      // Same names the answer must use, so there is nothing to translate.
      subScores: { price: s.scores.price, travelTime: s.scores.time, connections: s.scores.conn, weeksFit: s.scores.stay },
    })),
  };
  return JSON.stringify(payload);
}

// --- headline + summary (a small, fast model writes these from the picks that were already validated) ---
const SUMMARY_PROMPT = `You write the headline and summary for a flight search result. The picks were already chosen and explained; you are given them with their real data.
- headline: one sentence (max 140 chars) giving the single most useful insight across the picks.
- summary: 1-2 sentences (max 320 chars) on how the picks compare and what the traveler trades off.
Hard rules:
- Every dollar amount must come from the data: a priceUsd, a deltaVsCheapestUsd, a deltaVsNonstopUsd, or the exact difference between the priceUsd of two picks. Do no other arithmetic with prices.
- Never call anything nonstop or direct unless a pick's stopsOut or stopsBack is 0, and say which direction.
- Say nothing about a return leg whose stopsBack or travelTimeBack is null.
- No hype, no emoji, no exclamation marks. Prices are estimates, not live availability.
Return only JSON matching the schema.`;

export function summaryPrompt(p: PromptInput & { picks: { pick: { candidateId: string; why: string; reasons: string[] }; s: Scored }[] }) {
  const user = JSON.stringify({
    traveler: { from: p.from, to: p.to, priority: p.priority, stayPreference: p.stay, stayNights: p.hasReturn ? stayRange(p.stay, p.customStay) : null, roundTrip: p.hasReturn },
    dateCombinationsChecked: p.pairsChecked,
    picks: p.picks.map(({ pick, s }) => ({
      id: pick.candidateId,
      route: `${s.c.originAirport} -> ${s.c.destAirport}`,
      airline: s.c.airline,
      outbound: `${s.weekday} ${s.c.outDate}`,
      priceUsd: s.c.price,
      stopsOut: s.c.stopsOut,
      stopsBack: s.c.stopsBack,
      travelTimeBack: s.c.minutesBack === null ? null : fmtMinutes(s.c.minutesBack),
      deltaVsCheapestUsd: s.facts.deltaVsCheapest,
      deltaVsNonstopUsd: s.facts.deltaVsNonstop,
      isCheapest: s.facts.isCheapest,
      isFastest: s.facts.isFastest,
      why: pick.why,
    })),
  });
  return { system: SUMMARY_PROMPT, user };
}

// --- the search step: Claude decides which day combinations are worth a SerpApi search ---
export interface SearchPromptInput {
  from: string;
  to: string;
  departWeek: { start: string; end: string };
  returnWeek: { start: string; end: string } | null;
  stay: StayPreference;
  customStay?: NightsRange | null;
  priority: Priority;
  budget: number;
  deep: boolean;
  nearby: NearbyAirport[];
}

export function searchSystemPrompt(p: SearchPromptInput): string {
  const nights = stayRange(p.stay, p.customStay);
  const stayLine = !p.returnWeek
    ? 'This is a one-way trip.'
    : p.stay === 'about-two-weeks'
      ? 'The traveler wants a stay of about 14 nights.'
      : nights
        ? `The traveler wants a stay of ${nights.min === nights.max ? `${nights.min} night${nights.min === 1 ? '' : 's'}` : `${nights.min} to ${nights.max} nights`}. Nights = return date minus outbound date.`
        : p.stay === 'exact'
          ? 'Any stay length inside the two weeks is fine.'
          : 'Stay length does not matter; the cheapest fare wins.';
  return `You are flexfare's fare scout. Find where the good fares are by calling search_flights, which prices ONE day combination (live Google Flights via SerpApi) per call. You have at most ${p.budget} calls, each costs real money, so never repeat a combination.
Trip: ${p.from} to ${p.to}. Outbound must be ${p.departWeek.start} to ${p.departWeek.end}.${p.returnWeek ? ` Return must be ${p.returnWeek.start} to ${p.returnWeek.end}.` : ''} ${stayLine}
Traveler's priority: ${p.priority}.${p.nearby.length ? ` Nearby arrival worth one call: ${p.nearby.map((n) => `${n.airport} (${n.city}, ${n.transfer})`).join('; ')}.` : ''}
How to scout:
- Start with the combination that best fits the stay length, then use the other calls to test days likely to be cheaper (Tuesday, Wednesday and Saturday departures are usually cheaper than Friday and Sunday) and to see whether a shorter or longer stay inside the preference saves money.
- Make independent calls together in one turn. When the results show a clear winner, you may stop before using every call.
- Use only dates inside the windows above. Do not state any prices or write a long answer: when finished, reply with the single word "done".`;
}

export const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_flights',
  description: 'Price one day combination on live Google Flights. Returns the cheapest few options with price in USD per adult, stops, duration and airlines. Costs one search credit unless the same search was made recently.',
  input_schema: {
    type: 'object',
    properties: {
      out_date: { type: 'string', description: 'Outbound date, YYYY-MM-DD, inside the outbound window.' },
      back_date: { type: 'string', description: 'Return date, YYYY-MM-DD, inside the return window. Omit for a one-way trip.' },
      destination: { type: 'string', description: 'Arrival: "main" for the destination city, or a nearby airport code if one was offered.' },
    },
    required: ['out_date', 'destination'],
  },
};
