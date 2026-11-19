// The AI step, on Claude. Claude picks and explains; every number still comes from the fare data, and
// every answer is checked here before it is used (unknown ids, invented prices, wrong nonstop claims).
//   - picks: Sonnet 5.5 (regular) or Opus 5.5 (Deep Search), structured JSON output
//   - headline + summary: Haiku 5.5, written from the picks that survived validation
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Depth } from '../../src/shared/types.js';
import type { Scored } from './scoring.js';

const score = z.number().min(0).max(100);

const picksSchema = z.object({
  picks: z
    .array(
      z.object({
        candidateId: z.string(),
        fit: score,
        why: z.string().min(1),
        reasons: z.array(z.string().min(1)).min(1).max(5),
        scores: z.object({ price: score, travelTime: score, connections: score, weeksFit: score }),
      }),
    )
    .min(1)
    .max(5),
});
const summarySchema = z.object({ headline: z.string().min(1), summary: z.string().min(1) });

export type AiPick = z.infer<typeof picksSchema>['picks'][number];
export interface AiResult {
  picks: AiPick[];
  /** Absent when the summary step failed; the caller writes a plain one from the data. */
  headline?: string;
  summary?: string;
}

// Strict structured-output schemas (every key required, no extra keys).
const num = { type: 'number' };
export const PICKS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['candidateId', 'fit', 'why', 'reasons', 'scores'],
        properties: {
          candidateId: { type: 'string' },
          fit: num,
          why: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' } },
          scores: {
            type: 'object',
            additionalProperties: false,
            required: ['price', 'travelTime', 'connections', 'weeksFit'],
            properties: { price: num, travelTime: num, connections: num, weeksFit: num },
          },
        },
      },
    },
  },
} as const;
export const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary'],
  properties: { headline: { type: 'string' }, summary: { type: 'string' } },
} as const;

/** The model's answer broke our rules (bad JSON, unknown id, invented price). Worth one retry with feedback. */
export class AnswerError extends Error {}
/** The model can't answer right now (down, rate limited, refused). Worth trying the other model. */
class Unavailable extends Error {}
/** Anthropic rejected the request itself (bad key, bad request). Retrying can't change that. */
class Rejected extends Error {}

/** Dollar amounts the model is allowed to mention. */
export function allowedDollars(cands: Scored[]): Set<number> {
  const s = new Set<number>();
  for (const x of cands) {
    s.add(x.c.price);
    s.add(x.facts.deltaVsCheapest);
    if (x.facts.deltaVsNonstop !== null) s.add(Math.abs(x.facts.deltaVsNonstop));
  }
  return s;
}

const trunc = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const clampInt = (n: number) => Math.round(Math.max(0, Math.min(100, n)));

/** Every amount must be a real price or a real difference, whether written $80, 80 USD or 80 dollars. */
function checkMoney(text: string, dollars: Set<number>) {
  for (const m of text.matchAll(/\$\s?(\d[\d,]*)|(\d[\d,]*)\s?[-‐-― ]?\s?(?:USD|dollars?)\b/gi)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ''));
    if (!dollars.has(n)) throw new AnswerError(`The amount ${n} dollars does not appear in the candidate data. Only quote prices, the differences given to you, or the difference between two of your picks.`);
  }
}

/** "$123 cheaper than the nonstop" compares with another flight; it isn't a claim about the flight being described. */
const withoutComparisons = (s: string) =>
  s.replace(/\b(?:than|vs\.?|versus|over|under|against|unlike|beats?|compared (?:to|with)|relative to|instead of)\s+(?:the |a |an |any |that )?(?:(?:only|cheapest|fastest|other|next|one) )*(?:non-?stop|direct)\b/gi, ' ');

const NS = '(?:non-?stop|direct)';

/** Throws AnswerError(message) describing what's wrong, so the caller can retry with the message. */
export function validatePicks(raw: unknown, cands: Scored[]): AiPick[] {
  const parsed = picksSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new AnswerError(`Output did not match the schema at ${i?.path.join('.') || 'the top level'}: ${i?.message ?? 'invalid'}. Every score must be a whole number from 0 to 100.`);
  }
  const out = parsed.data;
  const byId = new Map(cands.map((c) => [c.c.id, c]));
  const seen = new Set<string>();
  for (const p of out.picks) {
    if (!byId.has(p.candidateId)) throw new AnswerError(`Unknown candidateId "${p.candidateId}". Use only ids from the candidates list.`);
    if (seen.has(p.candidateId)) throw new AnswerError(`candidateId "${p.candidateId}" appears twice.`);
    seen.add(p.candidateId);
  }

  const dollars = allowedDollars(cands);
  const pickedPrices = out.picks.map((p) => byId.get(p.candidateId)!.c.price);
  for (const a of pickedPrices) for (const b of pickedPrices) dollars.add(Math.abs(a - b)); // difference between two picks
  checkMoney(out.picks.flatMap((p) => [p.why, ...p.reasons]).join(' '), dollars);

  // Stops: claims about nonstop/direct must match the direction they are about.
  for (const p of out.picks) {
    const c = byId.get(p.candidateId)!.c;
    const text = withoutComparisons([p.why, ...p.reasons].join(' '));
    const out0 = c.stopsOut === 0;
    // A return leg we know nothing about (stopsBack null) can't be called nonstop either.
    const back0 = c.stopsBack === 0;
    const bad = (why: string) => {
      throw new AnswerError(`Pick ${p.candidateId} has stopsOut ${c.stopsOut} and stopsBack ${c.stopsBack ?? 'n/a'}, so ${why}`);
    };
    if (new RegExp(`\\b${NS}\\s+(?:both ways|each way|in both directions|both directions|both legs|round[- ]?trip)`, 'i').test(text) && !(out0 && (back0 || c.backDate === null))) {
      bad('it must not be described as nonstop or direct both ways.');
    }
    if (new RegExp(`\\b${NS}\\s+(?:outbound|out\\b|departure|leg out|on the way out|going out)`, 'i').test(text) && !out0) {
      bad('the outbound leg must not be called nonstop or direct.');
    }
    if (new RegExp(`\\b${NS}\\s+(?:return|inbound|back\\b|coming back|on the way back|homeward)`, 'i').test(text) && !back0) {
      bad('the return leg must not be called nonstop or direct.');
    }
    // A bare "nonstop flight" claim needs at least one nonstop direction.
    if (new RegExp(`\\b${NS}\\b`, 'i').test(text) && !out0 && !back0) bad('it must not be described as nonstop or direct.');
  }

  return out.picks.map((p) => ({
    ...p,
    fit: clampInt(p.fit),
    why: trunc(p.why, 220),
    reasons: p.reasons.map((r) => trunc(r, 200)).slice(0, 4),
    scores: {
      price: clampInt(p.scores.price),
      travelTime: clampInt(p.scores.travelTime),
      connections: clampInt(p.scores.connections),
      weeksFit: clampInt(p.scores.weeksFit),
    },
  }));
}

/** The headline and summary are held to the same money and nonstop rules as the picks. */
export function validateSummary(raw: unknown, picks: AiPick[], cands: Scored[]): { headline: string; summary: string } {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) throw new AnswerError(`Output did not match the schema at ${parsed.error.issues[0]?.path.join('.') || 'the top level'}.`);
  const byId = new Map(cands.map((c) => [c.c.id, c.c]));
  const chosen = picks.map((p) => byId.get(p.candidateId)!);
  const dollars = allowedDollars(cands);
  for (const a of chosen) for (const b of chosen) dollars.add(Math.abs(a.price - b.price));
  const text = `${parsed.data.headline} ${parsed.data.summary}`;
  checkMoney(text, dollars);
  const claims = withoutComparisons(text);
  if (new RegExp(`\\b${NS}\\b`, 'i').test(claims) && !chosen.some((c) => c.stopsOut === 0 || c.stopsBack === 0)) {
    throw new AnswerError('None of the picks is nonstop or direct in either direction, so the text must not say so.');
  }
  return { headline: trunc(parsed.data.headline, 140), summary: trunc(parsed.data.summary, 320) };
}

export interface ModelPlan {
  primary: string;
  /** Only used when the primary is down, rate limited or declined, never for a bad answer. */
  fallback: string;
  /** Writes the headline and summary. */
  summary: string;
  effort: 'low' | 'medium';
  maxTokens: number;
}

/**
 * Regular searches use Sonnet; a Deep Search (1 per user per day) uses Opus with more candidates and room for
 * fuller explanations. Each falls back to the other only when its own model is unavailable.
 * Never send temperature/top_p/budget_tokens: these models reject them. Depth of thinking is `effort`.
 */
export function modelPlan(depth: Depth): ModelPlan {
  const regular = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  const deep = process.env.CLAUDE_DEEP_MODEL || 'claude-opus-5-5';
  const summary = process.env.CLAUDE_SUMMARY_MODEL || 'claude-haiku-5-5';
  return depth === 'deep'
    ? { primary: deep, fallback: regular, summary, effort: 'medium', maxTokens: 10000 }
    : { primary: regular, fallback: deep, summary, effort: 'low', maxTokens: 6000 };
}

export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** One client per process. No SDK retries: our own two-attempt budget decides what is worth a second call. */
let shared: Anthropic | undefined;
export const getClient = (): Anthropic => (shared ??= new Anthropic({ maxRetries: 0, timeout: 60_000, fetch: (input, init) => fetch(input, init) }));

/** One line per call with the real token counts, so what a search costs can be read from the logs. */
export function logUsage(label: string, model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined) {
  if (usage) console.info(`[claude] ${label} ${model} in=${usage.input_tokens ?? 0} out=${usage.output_tokens ?? 0}`);
}

export interface ClaudeDeps {
  client?: Pick<Anthropic, 'messages'>;
}

/** One structured-output call. Throws AnswerError / Unavailable / Rejected. */
async function callJson(client: Pick<Anthropic, 'messages'>, o: { model: string; effort: 'low' | 'medium'; maxTokens: number; system: string; user: string; schema: object }): Promise<unknown> {
  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model: o.model,
      max_tokens: o.maxTokens,
      system: o.system,
      output_config: { effort: o.effort, format: { type: 'json_schema', schema: o.schema as Record<string, unknown> } },
      messages: [{ role: 'user', content: o.user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
      if ([404, 429].includes(err.status) || err.status >= 500) throw new Unavailable(`Claude responded ${err.status}`);
      throw new Rejected(`Claude responded ${err.status}: ${err.message.slice(0, 300)}`);
    }
    throw new Unavailable(err instanceof Error ? err.message : String(err)); // timeouts, dropped connections
  }
  logUsage('answer', o.model, res.usage);
  if (res.stop_reason === 'refusal') throw new Unavailable('Claude declined the request');
  if (res.stop_reason === 'max_tokens') throw new AnswerError('The answer was cut off. Keep it shorter and return complete JSON.');
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  if (!text) throw new AnswerError('Claude returned no text.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AnswerError('The answer was not valid JSON.');
  }
}

/**
 * Two attempts at most:
 *  - a bad answer -> the SAME model tries once more, told what was wrong (so regular searches stay cheap);
 *  - Claude down, rate limited or declined -> the other model tries;
 *  - Claude rejects the request outright (400/401/403/422) -> stop, retrying can't change that.
 * Returns null when giving up.
 */
async function attempt<T>(label: string, primary: string, fallback: string, run: (model: string, feedback: string) => Promise<T>): Promise<T | null> {
  let model = primary;
  let feedback = '';
  for (let n = 1; n <= 2; n++) {
    try {
      return await run(model, feedback);
    } catch (err) {
      console.error(`[claude] ${label} attempt ${n} (${model}) failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof AnswerError) {
        feedback = err.message;
        model = primary;
      } else if (err instanceof Rejected || fallback === primary) {
        return null;
      } else {
        model = fallback;
      }
    }
  }
  return null;
}

const withFeedback = (user: string, feedback: string) => (feedback ? `${user}\n\nYour previous answer was rejected: ${feedback}\nFix that and answer again.` : user);

export interface SummaryPrompt {
  system: string;
  user: string;
}

/**
 * Picks first (the big model), then the headline and summary (Haiku), written from the validated picks.
 * Returns null when the picks can't be had; the caller then uses the deterministic ranking. A failed summary
 * keeps the picks and leaves headline/summary unset.
 */
export async function askClaude(
  system: string,
  user: string,
  cands: Scored[],
  plan: ModelPlan,
  summarize: (picks: AiPick[]) => SummaryPrompt,
  deps: ClaudeDeps = {},
): Promise<AiResult | null> {
  if (!claudeConfigured() && !deps.client) return null;
  const client = deps.client ?? getClient();

  const picks = await attempt('picks', plan.primary, plan.fallback, async (model, feedback) =>
    validatePicks(await callJson(client, { model, effort: plan.effort, maxTokens: plan.maxTokens, system, user: withFeedback(user, feedback), schema: PICKS_SCHEMA }), cands),
  );
  if (!picks) return null;

  const prompt = summarize(picks);
  const text = await attempt('summary', plan.summary, plan.summary, async (model, feedback) =>
    validateSummary(await callJson(client, { model, effort: 'low', maxTokens: 2000, system: prompt.system, user: withFeedback(prompt.user, feedback), schema: SUMMARY_SCHEMA }), picks, cands),
  );
  return { picks, ...(text ?? {}) };
}
