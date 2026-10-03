import type { Scored } from './scoring.js';
import { fmtMinutes } from './scoring.js';
import type { NearbyAirport } from './nearby.js';
import type { Depth, Priority, StayPreference } from '../../src/shared/types.js';

const BASE_PROMPT = `You are flexfare's route analyst. You are given flight candidates that were already found and scored. Choose the best 3 to 5 for this traveler and explain the trade-offs in plain, specific language.

Hard rules:
- Only pick candidates by their "id". Never invent a route, airline, time or price.
- Every dollar amount you write must come from the candidate data: a priceUsd, a deltaVsCheapestUsd, a deltaVsNonstopUsd, or the exact difference between the priceUsd of two candidates you picked. Do no other arithmetic with prices.
- Describe stops exactly as given: stopsOut / stopsBack of 0 means nonstop in that direction, anything higher means that many stops. Never call a pick nonstop or direct unless at least one direction has 0 stops, and say which direction.
- We do not have layover lengths, so never mention how long a layover is. Do not write badges or warnings; the app adds those.
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
  hasReturn: boolean;
  pairsChecked: number;
  nearby: NearbyAirport[];
  candidates: Scored[];
}

export function buildUserMessage(p: PromptInput): string {
  const payload = {
    traveler: { from: p.from, to: p.to, priority: p.priority, stayPreference: p.stay, roundTrip: p.hasReturn },
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
