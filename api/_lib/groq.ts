import { z } from 'zod';
import type { Scored } from './scoring.js';

const BADGES = ['Best fit', 'Fastest', 'Lowest fare', 'Nearby arrival'] as const;
const score = z.number().min(0).max(100);

const outputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  picks: z
    .array(
      z.object({
        candidateId: z.string(),
        fit: score,
        badge: z.enum(BADGES).nullable(),
        warning: z.string().nullable(),
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
const nullableString = { type: ['string', 'null'] };
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
        required: ['candidateId', 'fit', 'badge', 'warning', 'why', 'reasons', 'scores'],
        properties: {
          candidateId: { type: 'string' },
          fit: num,
          badge: { type: ['string', 'null'], enum: [...BADGES, null] },
          warning: nullableString,
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
  const ids = new Set(cands.map((c) => c.c.id));
  const seen = new Set<string>();
  const badges = new Set<string>();
  const dollars = allowedDollars(cands);

  for (const p of out.picks) {
    if (!ids.has(p.candidateId)) throw new AnswerError(`Unknown candidateId "${p.candidateId}". Use only ids from the candidates list.`);
    if (seen.has(p.candidateId)) throw new AnswerError(`candidateId "${p.candidateId}" appears twice.`);
    seen.add(p.candidateId);
    if (p.badge) {
      if (badges.has(p.badge)) throw new AnswerError(`Badge "${p.badge}" is used more than once.`);
      badges.add(p.badge);
    }
  }
  // The model may also quote the exact difference between two of its own picks.
  const pickedPrices = out.picks.map((p) => cands.find((c) => c.c.id === p.candidateId)!.c.price);
  for (const a of pickedPrices) for (const b of pickedPrices) dollars.add(Math.abs(a - b));
  const text = [out.headline, out.summary, ...out.picks.flatMap((p) => [p.why, p.warning ?? '', ...p.reasons])].join(' ');
  for (const m of text.matchAll(/\$\s?(\d[\d,]*)/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!dollars.has(n)) throw new AnswerError(`The amount $${n} does not appear in the candidate data. Only quote prices, the differences given to you, or the difference between two of your picks.`);
  }

  return {
    headline: trunc(out.headline, 140),
    summary: trunc(out.summary, 320),
    picks: out.picks.map((p) => ({
      ...p,
      fit: clampInt(p.fit),
      warning: p.warning ? trunc(p.warning, 30) : null,
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
  primary: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  fallback: process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b',
});

const MAX_GENERATIONS = 2; // answers the model actually produced (these cost tokens)
const MAX_REQUESTS = 3; // plus at most one rejected request (429/5xx/404 cost nothing)

/**
 * Call budget, so a failing setup can't burn your quota:
 *  - the model produced a bad answer -> try again once, telling it what was wrong (max 2 answers total);
 *  - Groq is down, rate limited or the model is missing -> that request cost nothing, so move to the
 *    fallback model (still within the 2-answer budget);
 *  - Groq rejects the request outright (400/401/403/422) -> stop. Repeating it would fail the same way.
 * Returns null when giving up; the caller then uses the deterministic ranking.
 */
export async function askGroq(system: string, user: string, cands: Scored[], models = defaultModels()): Promise<AiOutput | null> {
  let model = models.primary;
  let feedback = '';
  let generations = 0;
  let usedFallback = false;

  for (let request = 1; request <= MAX_REQUESTS; request++) {
    try {
      const prompt = feedback ? `${user}\n\nYour previous answer was rejected: ${feedback}\nFix it and answer again.` : user;
      return validateOutput(await call(model, system, prompt), cands);
    } catch (err) {
      console.error(`[groq] request ${request} (${model}) failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof AnswerError) {
        if (++generations >= MAX_GENERATIONS) return null;
        feedback = err.message; // same model, with the reason
        continue;
      }
      const retryable = err instanceof GroqHttpError ? err.status === 404 || err.status === 429 || err.status >= 500 : true;
      if (!retryable || usedFallback || models.fallback === models.primary) return null;
      usedFallback = true;
      model = models.fallback;
    }
  }
  return null;
}
