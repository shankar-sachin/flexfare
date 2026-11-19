// What the admin page shows: SerpApi credits, searches and Claude usage per day, with an estimated Claude cost.
import type { AdminDay, AdminStats } from '../../src/shared/types.js';
import { adminEmails } from './admin.js';
import { claudeConfigured, modelPlan } from './claude.js';
import { modelKey } from './claudeUsage.js';
import { db } from './firestore.js';
import { intEnv, todayKey } from './http.js';
import { bookLimit } from './bookQuota.js';
import { limits } from './quota.js';
import { monthKey } from './serpCredits.js';

/** USD per million tokens (input, output), list prices. Unknown models get no cost rather than a wrong one. */
const PRICES: Record<string, [number, number]> = {
  claude_haiku_5_5: [0.1, 0.5],
  claude_sonnet_5_5: [2, 10],
  claude_sonnet_5: [2, 10],
  claude_opus_5_5: [4, 20],
  claude_opus_5: [5, 25],
};

export const costOf = (key: string, tokensIn: number, tokensOut: number): number | null => {
  const p = PRICES[key];
  return p ? (tokensIn * p[0] + tokensOut * p[1]) / 1_000_000 : null;
};

const round = (n: number) => Math.round(n * 10000) / 10000;

type ModelCounters = Record<string, { calls?: number; in?: number; out?: number }>;

/** One day from its two Firestore docs' data. Pure, so it can be tested. */
export function buildDay(day: string, global: { count?: number } | undefined, claude: { models?: ModelCounters } | undefined): AdminDay {
  const models = Object.entries(claude?.models ?? {}).map(([key, m]) => {
    const tokensIn = m.in ?? 0;
    const tokensOut = m.out ?? 0;
    return { model: key.replace(/_/g, '-'), calls: m.calls ?? 0, tokensIn, tokensOut, costUsd: (() => { const c = costOf(key, tokensIn, tokensOut); return c === null ? null : round(c); })() };
  });
  const known = models.filter((m) => m.costUsd !== null);
  return {
    day,
    searches: global?.count ?? 0,
    claudeCalls: models.reduce((a, m) => a + m.calls, 0),
    tokensIn: models.reduce((a, m) => a + m.tokensIn, 0),
    tokensOut: models.reduce((a, m) => a + m.tokensOut, 0),
    costUsd: models.length === 0 ? 0 : known.length === models.length ? round(known.reduce((a, m) => a + (m.costUsd as number), 0)) : null,
    models,
  };
}

const DAYS = 7;

export async function getAdminStats(now = new Date()): Promise<AdminStats> {
  const firestore = db();
  const usage = firestore.collection('usage');
  const dayKeys = Array.from({ length: DAYS }, (_, i) => todayKey(new Date(now.getTime() - i * 86400000)));
  const [globals, claudes, serp] = await Promise.all([
    Promise.all(dayKeys.map((d) => usage.doc(`global_${d}`).get())),
    Promise.all(dayKeys.map((d) => usage.doc(`claude_${d}`).get())),
    usage.doc(`serpapi_${monthKey(now)}`).get(),
  ]);
  const lim = limits();
  const plan = modelPlan('regular');
  return {
    generatedAt: now.toISOString(),
    serpapi: { month: monthKey(now), used: (serp.data()?.count as number | undefined) ?? 0, limit: intEnv('SERPAPI_MONTHLY_LIMIT', 100) },
    limits: { regular: lim.regular, deep: lim.deep, ip: lim.ip, global: lim.global, bookPerUser: bookLimit() },
    days: dayKeys.map((d, i) => buildDay(d, globals[i].data() as { count?: number } | undefined, claudes[i].data() as { models?: ModelCounters } | undefined)),
    config: {
      fareProvider: process.env.FARE_PROVIDER ?? 'simulated',
      claudeModel: plan.primary,
      claudeDeepModel: modelPlan('deep').primary,
      claudeSummaryModel: plan.summary,
      claudeConfigured: claudeConfigured(),
      admins: adminEmails().size,
    },
  };
}

export { modelKey };
