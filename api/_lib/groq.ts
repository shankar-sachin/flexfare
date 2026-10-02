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

/** Throws Error(message) describing what's wrong, so the caller can retry with the message. */
export function validateOutput(raw: unknown, cands: Scored[]): AiOutput {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Output did not match the schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const out = parsed.data;
  const ids = new Set(cands.map((c) => c.c.id));
  const seen = new Set<string>();
  const badges = new Set<string>();
  const dollars = allowedDollars(cands);

  for (const p of out.picks) {
    if (!ids.has(p.candidateId)) throw new Error(`Unknown candidateId "${p.candidateId}". Use only ids from the candidates list.`);
    if (seen.has(p.candidateId)) throw new Error(`candidateId "${p.candidateId}" appears twice.`);
    seen.add(p.candidateId);
    if (p.badge) {
      if (badges.has(p.badge)) throw new Error(`Badge "${p.badge}" is used more than once.`);
      badges.add(p.badge);
    }
  }
  const text = [out.headline, out.summary, ...out.picks.flatMap((p) => [p.why, p.warning ?? '', ...p.reasons])].join(' ');
  for (const m of text.matchAll(/\$\s?(\d[\d,]*)/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!dollars.has(n)) throw new Error(`The amount $${n} does not appear in the candidate data. Only quote prices and differences given to you.`);
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

async function call(model: string, system: string, user: string, structured: boolean): Promise<unknown> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  const body: Record<string, unknown> = {
    model,
    temperature: 0.3,
    max_tokens: 2500,
    messages: [
      { role: 'system', content: structured ? system : `${system}\nReturn a JSON object with keys headline, summary, picks.` },
      { role: 'user', content: user },
    ],
    response_format: structured
      ? { type: 'json_schema', json_schema: { name: 'curation', strict: true, schema: JSON_SCHEMA } }
      : { type: 'json_object' },
  };
  if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Groq responded ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no content');
  return JSON.parse(content);
}

export interface CuratePlan {
  primary: string;
  fallback: string;
}
export const defaultModels = (): CuratePlan => ({
  primary: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  fallback: 'llama-3.3-70b-versatile',
});

/**
 * Tries the primary model (retrying once with the validation error), then the fallback model.
 * Returns null if every attempt fails; the caller then uses the deterministic fallback.
 */
export async function askGroq(system: string, user: string, cands: Scored[], models = defaultModels()): Promise<AiOutput | null> {
  const attempts: { model: string; structured: boolean }[] = [
    { model: models.primary, structured: true },
    { model: models.primary, structured: true },
    { model: models.fallback, structured: false },
  ];
  let lastError = '';
  for (const [i, a] of attempts.entries()) {
    try {
      const prompt = i === 1 && lastError ? `${user}\n\nYour previous answer was rejected: ${lastError}\nFix it and answer again.` : user;
      return validateOutput(await call(a.model, system, prompt, a.structured), cands);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[groq] attempt ${i + 1} (${a.model}) failed: ${lastError}`);
    }
  }
  return null;
}
