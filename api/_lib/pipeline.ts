// The curation pipeline: fares -> deterministic scoring -> Groq analysis -> CuratedRoute[].
// The LLM only chooses candidates and writes text. Every number shown comes from provider data.
import type { CuratedRoute, CurationResult, DayFare, Leg, Week, WeekFare } from '../../src/shared/types.js';
import { upcomingWeeks } from '../../src/shared/weeks.js';
import { cacheGet, cacheSet } from './cache.js';
import { askGroq, type AiPick } from './groq.js';
import { buildLinks } from '../../src/shared/links.js';
import { nearbyFor } from './nearby.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { getProvider } from './providers/index.js';
import type { DayGridCell, NormalizedQuery } from './providers/types.js';
import { fmtMinutes, scoreCandidates, type Scored } from './scoring.js';
import type { Priority, StayPreference } from '../../src/shared/types.js';

const stopsText = (n: number) => (n === 0 ? 'nonstop' : `${n} stop${n === 1 ? '' : 's'}`);
const stopsLabel = (s: Scored) => {
  const a = s.c.stopsOut;
  const b = s.c.stopsBack;
  return b === null || a === b ? stopsText(a) : `${stopsText(a)} out, ${stopsText(b)} back`;
};

/** Deltas ($ over the cheapest day) for the 7 days of a week, from the day-pair grid. */
function dayFares(week: Week | null, grid: DayGridCell[], pick: (c: DayGridCell) => string | null): DayFare[] {
  if (!week) return [];
  const best = new Map<string, number>();
  for (const cell of grid) {
    const d = pick(cell);
    if (d && (best.get(d) ?? Infinity) > cell.price) best.set(d, cell.price);
  }
  const min = Math.min(...best.values());
  const out: DayFare[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${week.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    if (best.has(date)) out.push({ date, delta: best.get(date)! - min });
  }
  return out;
}

/**
 * Badges and warnings come from the data, never from the model: a small model will happily call a
 * 2-stop flight "nonstop" or pin "Lowest fare" on the wrong row. Best fit goes to the top pick; the
 * other badges only to a pick that really is the fastest / cheapest / a nearby arrival.
 */
export function decorate(picks: AiPick[], byId: Map<string, Scored>) {
  const taken = new Set<string>();
  const give = (b: NonNullable<CuratedRoute['badge']>, ok: boolean) => (ok && !taken.has(b) ? (taken.add(b), b) : undefined);
  return [...picks]
    .sort((a, b) => b.fit - a.fit)
    .map((pick, i) => {
      const s = byId.get(pick.candidateId)!;
      const badge =
        give('Best fit', i === 0) ?? give('Fastest', s.facts.isFastest) ?? give('Lowest fare', s.facts.isCheapest) ?? give('Nearby arrival', s.c.isNearby);
      const warning = s.c.isNearby
        ? `+ ${fmtMinutes(s.c.nearbyTransferMinutes)} transfer`
        : s.c.stopsOut >= 2 || (s.c.stopsBack ?? 0) >= 2
          ? 'Two or more stops'
          : undefined;
      return { pick, badge, warning };
    });
}

/** Used when the AI step fails: top 5 by pre-score with templated text built from real numbers. */
export function fallbackPicks(cands: Scored[]): AiPick[] {
  return cands.slice(0, 5).map((s) => {
    const reasons = [
      s.facts.isCheapest ? 'Lowest fare found for your weeks.' : `$${s.facts.deltaVsCheapest} more than the cheapest fare found.`,
      `${stopsLabel(s)}, about ${fmtMinutes(s.c.minutesOut)} each way.`,
    ];
    if (s.nights) reasons.push(`${s.nights} nights away.`);
    if (s.c.isNearby) reasons.push(`Land at ${s.c.destAirport} and add about ${fmtMinutes(s.c.nearbyTransferMinutes)} on the ground.`);
    return {
      candidateId: s.c.id,
      fit: s.pre,
      why: `${s.weekday}, ${stopsLabel(s)}, $${s.c.price} per adult.`,
      reasons,
      scores: { price: s.scores.price, travelTime: s.scores.time, connections: s.scores.conn, weeksFit: s.scores.stay },
    };
  });
}

export async function runCuration(
  q: NormalizedQuery,
  prefs: { stay: StayPreference; priority: Priority },
): Promise<CurationResult> {
  const provider = getProvider();
  const found = await provider.searchWeeks(q);
  const hasReturn = q.returnWeek !== null;
  const scored = scoreCandidates(found.candidates, { priority: prefs.priority, stay: prefs.stay, hasReturn });

  const empty = (note: string): CurationResult => ({
    headline: 'No fares found for these weeks.',
    summary: 'We could not find cached fares for this route and these weeks. Try nearby weeks, or search directly with the links below.',
    combosChecked: found.pairsChecked,
    sample: found.sample,
    dataNote: note,
    weekFares: [],
    routes: [],
  });
  if (scored.length === 0) return empty('Fares for this route are not in our data for those weeks. Check Google Flights or Skyscanner for live prices.');

  const ai = await askGroq(
    SYSTEM_PROMPT,
    buildUserMessage({
      from: q.from, to: q.to, priority: prefs.priority, stay: prefs.stay, hasReturn,
      pairsChecked: found.pairsChecked, nearby: nearbyFor(q.to), candidates: scored,
    }),
    scored,
  );
  const picks = ai?.picks ?? fallbackPicks(scored);
  const byId = new Map(scored.map((s) => [s.c.id, s]));

  const routes = decorate(picks, byId).map<CuratedRoute>(({ pick: p, badge, warning }) => {
    const s = byId.get(p.candidateId)!;
    const c = s.c;
    const leg = (date: string, minutes: number, stops: number | null, departAt?: string): Leg => ({
      date, totalDuration: fmtMinutes(minutes), stops: stops ?? undefined, departAt, segments: [], layovers: [],
    });
    return {
      id: c.id,
      fit: p.fit,
      price: c.price,
      totalMinutes: s.effMinutes,
      carrier: c.airline,
      fromAirport: c.originAirport,
      toAirport: c.destAirport,
      via: stopsLabel(s),
      outDate: c.outDate,
      backDate: c.backDate,
      duration: fmtMinutes(c.minutesOut),
      nights: s.nights,
      badge,
      warning,
      why: p.why,
      reasons: p.reasons,
      scores: [
        { label: 'Price', value: p.scores.price },
        { label: 'Travel time', value: p.scores.travelTime },
        { label: 'Connections', value: p.scores.connections },
        { label: 'Fits your weeks', value: p.scores.weeksFit },
      ],
      outbound: leg(c.outDate, c.minutesOut, c.stopsOut, c.departAt),
      inbound: c.backDate && c.minutesBack !== null ? leg(c.backDate, c.minutesBack, c.stopsBack) : null,
      outDayFares: dayFares(q.departWeek, found.grid, (g) => g.outDate),
      backDayFares: dayFares(q.returnWeek, found.grid, (g) => g.backDate),
      links: buildLinks({
        from: c.originAirport, to: c.destAirport, outDate: c.outDate, backDate: c.backDate,
        travelers: q.travelers, cabin: q.cabin, aviasalesPath: c.aviasalesPath, marker: process.env.TRAVELPAYOUTS_MARKER,
      }),
      priceFoundAt: c.foundAt,
    };
  });

  return {
    headline: ai?.headline ?? `Best match: ${routes[0].fromAirport} to ${routes[0].toAirport}, ${routes[0].via}, $${routes[0].price} per adult.`,
    summary:
      ai?.summary ??
      `We checked ${found.pairsChecked} date combinations. The AI summary is unavailable right now, so these are ranked by a score that weighs price, travel time, layovers and stay length.`,
    combosChecked: found.pairsChecked,
    aiFallback: !ai,
    sample: found.sample,
    dataNote: found.candidates.length < 3 ? 'Few fares are cached for these weeks. Treat prices as rough and check the links for live fares.' : undefined,
    weekFares: [],
    routes,
  };
}

/** Lowest fare per upcoming week for a city pair, cached for 12h. */
export async function getWeekFares(from: string, to: string): Promise<WeekFare[]> {
  const key = `${from}_${to}_${process.env.FARE_PROVIDER ?? 'simulated'}`;
  const hit = await cacheGet<WeekFare[]>('weekLows', key, 12 * 3600_000);
  if (hit) return hit;
  const fares = await getProvider().weekLows(from, to, upcomingWeeks(12));
  await cacheSet('weekLows', key, fares);
  return fares;
}
