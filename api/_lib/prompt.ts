import type { Scored } from './scoring.js';
import { fmtMinutes } from './scoring.js';
import type { NearbyAirport } from './nearby.js';
import type { Priority, StayPreference } from '../../src/shared/types.js';

export const SYSTEM_PROMPT = `You are flexfare's route analyst. You are given flight candidates that were already found and scored. Choose the best 3 to 5 for this traveler and explain the trade-offs in plain, specific language.

Hard rules:
- Only pick candidates by their "id". Never invent a route, airline, time or price.
- Every dollar amount you write must be copied from the candidate data (price, deltaVsCheapest, deltaVsNonstop). Do not do arithmetic with prices.
- No hype, no emoji, no exclamation marks. Prices are estimates, not live availability; never promise a fare.
- Say what the traveler gives up as well as what they gain, e.g. "$123 cheaper than the nonstop, about 3h 30m longer each way".
- The traveler's priority and stay length matter: weigh them, don't just copy the pre-score.
- badge may be used at most once each, and only when true: "Best fit" (your top pick), "Fastest" (isFastest), "Lowest fare" (isCheapest), "Nearby arrival" (a candidate with a ground transfer). Use null otherwise.
- "warning" is a short flag (max 30 chars) like "Long layover" or "+ 2h 50m train", or null.
- fit is your 0-100 overall score. Order picks best first.
- headline: one sentence (max 140 chars) giving the single most useful insight. summary: 1-2 sentences (max 320 chars).
Return only JSON matching the schema.`;

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
      subScores: s.scores,
    })),
  };
  return JSON.stringify(payload);
}
