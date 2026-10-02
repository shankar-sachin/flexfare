import { z } from 'zod';
import type { Scored } from './scoring.js';

const score = z.number().min(0).max(100);

const outputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
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
export type AiOutput = z.infer<typeof outputSchema>;
export type AiPick = AiOutput['picks'][number];

// Strict structured-output schema (every key required; optional values are nullable).
const num = { type: 'number' };
export const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'picks'],
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
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

/** The model's answer broke our rules (bad JSON, unknown id, invented price). Worth one retry with feedback. */
class AnswerError extends Error {}
/** Groq itself said no. */
class GroqHttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Groq responded ${status}: ${detail}`);
  }
}

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

/** Throws AnswerError(message) describing what's wrong, so the caller can retry with the message. */
export function validateOutput(raw: unknown, cands: Scored[]): AiOutput {
  const parsed = outputSchema.safeParse(raw);
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

  // Money: every amount must be a real price or a real difference, whether written $80, 80 USD or 80 dollars.
  const dollars = allowedDollars(cands);
  const pickedPrices = out.picks.map((p) => byId.get(p.candidateId)!.c.price);
  for (const a of pickedPrices) for (const b of pickedPrices) dollars.add(Math.abs(a - b)); // difference between two picks
  const text = [out.headline, out.summary, ...out.picks.flatMap((p) => [p.why, ...p.reasons])].join(' ');
  for (const m of text.matchAll(/\$\s?(\d[\d,]*)|(\d[\d,]*)\s?[-\u2010-\u2015 ]?\s?(?:USD|dollars?)\b/gi)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ''));
    if (!dollars.has(n)) throw new AnswerError(`The amount ${n} dollars does not appear in the candidate data. Only quote prices, the differences given to you, or the difference between two of your picks.`);
  }

  // Stops: a pick may only be called nonstop/direct if at least one direction really is.
  for (const p of out.picks) {
    const c = byId.get(p.candidateId)!.c;
    // "$123 cheaper than the nonstop" compares with another flight; it isn't a claim about this pick.
    const withoutComparisons = [p.why, ...p.reasons]
      .join(' ')
      .replace(/\b(?:than|vs\.?|versus|over|under|against|unlike|beats?|compared (?:to|with)|relative to|instead of)\s+(?:the |a |an |any |that )?(?:(?:only|cheapest|fastest|other|next|one) )*(?:non-?stop|direct)\b/gi, ' ');
    const claimsNonstop = /\b(non-?stop|direct)\b/i.test(withoutComparisons);
    if (claimsNonstop && c.stopsOut > 0 && (c.stopsBack ?? 1) > 0) {
      throw new AnswerError(`Pick ${p.candidateId} has stops in every direction (stopsOut ${c.stopsOut}, stopsBack ${c.stopsBack ?? 'n/a'}), so it must not be described as nonstop or direct.`);
    }
  }

  return {
    headline: trunc(out.headline, 140),
    summary: trunc(out.summary, 320),
    picks: out.picks.map((p) => ({
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
    })),
  };
}

async function call(model: string, system: string, user: string): Promise<unknown> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqHttpError(401, 'GROQ_API_KEY is not set');
  const body: Record<string, unknown> = {
    model,
    temperature: 0.3,
    // Reasoning models spend part of this on thinking, so leave plenty of room for the JSON itself.
    max_completion_tokens: 2500,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'curation', strict: true, schema: JSON_SCHEMA } },
  };
  if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 600);
    // Groq answers 400 json_validate_failed when the MODEL's output broke the schema (e.g. a null score).
    // That's a bad answer, worth one retry with feedback, not a broken request.
    if (res.status === 400 && detail.includes('json_validate_failed')) {
      const why = /Error: (jsonschema[^"\\]*)/.exec(detail)?.[1] ?? 'it did not match the schema';
      throw new AnswerError(`Your JSON did not match the schema (${why.slice(0, 200)}). Every score must be a whole number from 0 to 100, never null.`);
    }
    throw new GroqHttpError(res.status, detail.slice(0, 400));
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AnswerError(`Groq returned no content (finish_reason: ${json.choices?.[0]?.finish_reason ?? 'unknown'})`);
  try {
    return JSON.parse(content);
  } catch {
    throw new AnswerError('The answer was not valid JSON (it may have been cut off).');
  }
}

export interface CuratePlan {
  primary: string;
  fallback: string;
}
export const defaultModels = (): CuratePlan => ({
  // The smaller model first: cheaper and faster, and good enough to rank a short list. Both support strict JSON.
  primary: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  fallback: process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-120b',
});

/**
 * Two attempts at most: the cheap model first, then the stronger one if the first fails.
 *  - a bad answer from the first model -> the second model gets the reason as feedback;
 *  - Groq down, rate limited (separate limit per model) or model missing -> the second model tries;
 *  - Groq rejects the request outright (400/401/403/422) -> stop, a different model won't change that.
 * Returns null when giving up; the caller then uses the deterministic ranking.
 */
export async function askGroq(system: string, user: string, cands: Scored[], models = defaultModels()): Promise<AiOutput | null> {
  const order = models.fallback === models.primary ? [models.primary] : [models.primary, models.fallback];
  let feedback = '';
  for (const [i, model] of order.entries()) {
    try {
      const prompt = feedback ? `${user}\n\nA previous answer was rejected: ${feedback}\nFix that and answer again.` : user;
      return validateOutput(await call(model, system, prompt), cands);
    } catch (err) {
      console.error(`[groq] attempt ${i + 1} (${model}) failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof GroqHttpError && !(err.status === 404 || err.status === 429 || err.status >= 500)) return null;
      if (err instanceof AnswerError) feedback = err.message;
    }
  }
  return null;
}
