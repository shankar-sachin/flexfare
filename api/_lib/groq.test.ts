import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askGroq, modelPlan, validateOutput } from './groq';
import { decorate, fallbackPicks } from './pipeline';
import type { FareCandidate } from './providers/types';
import { scoreCandidates } from './scoring';

const cand = (id: string, price: number, o: Partial<FareCandidate> = {}): FareCandidate => ({
  id, originAirport: 'OAK', destAirport: 'LIS', isNearby: false, nearbyTransferMinutes: 0, outDate: '2026-10-20', backDate: '2026-11-03',
  price, airline: 'Atlantica', stopsOut: 1, stopsBack: 1, minutesOut: 800, minutesBack: 800, foundAt: '2026-10-01T00:00:00Z', ...o,
});
const prefs = { priority: 'balance' as const, stay: 'range' as const, hasReturn: true };
// a = cheap with 1 stop each way; b = pricier nonstop both ways and fastest
const scored = scoreCandidates(
  [cand('a', 489), cand('b', 612, { stopsOut: 0, stopsBack: 0, minutesOut: 665, minutesBack: 665, outDate: '2026-10-22' })],
  prefs,
);
const pick = (id: string, extra: object = {}) => ({
  candidateId: id, fit: 90, why: 'Fine.', reasons: ['One reason.'],
  scores: { price: 90, travelTime: 80, connections: 70, weeksFit: 100 }, ...extra,
});
const output = (picks: object[], extra: object = {}) => ({ headline: 'Headline', summary: 'Summary', picks, ...extra });

describe('validateOutput', () => {
  it('accepts a valid answer', () => {
    expect(validateOutput(output([pick('a', { fit: 100 })]), scored).picks[0].candidateId).toBe('a');
  });

  it('rejects unknown ids, duplicate ids and malformed output', () => {
    expect(() => validateOutput(output([pick('zzz')]), scored)).toThrow(/Unknown candidateId/);
    expect(() => validateOutput(output([pick('a'), pick('a')]), scored)).toThrow(/twice/);
    expect(() => validateOutput({ headline: 'x' }, scored)).toThrow(/schema/);
  });

  it('says where the schema was broken, e.g. a score above 100 or a null', () => {
    expect(() => validateOutput(output([pick('a', { scores: { price: 150, travelTime: 1, connections: 1, weeksFit: 1 } })]), scored)).toThrow(/picks\.0\.scores\.price.*0 to 100/);
    expect(() => validateOutput(output([pick('a', { scores: { price: 1, travelTime: 1, connections: 1, weeksFit: null } })]), scored)).toThrow(/weeksFit/);
  });

  it('rejects invented dollar amounts in every format, but allows real ones', () => {
    for (const why of ['Only $321 for this.', 'Only 321 USD for this.', 'A 321-USD fare.', 'Just 321 dollars.', 'Only $ 321.']) {
      expect(() => validateOutput(output([pick('a', { why })]), scored), why).toThrow(/does not appear/);
    }
    expect(() => validateOutput(output([pick('a', { why: 'Costs $489, which is 123 USD under the nonstop.' })]), scored)).not.toThrow();
  });

  it('only lets a pick be called nonstop or direct if a direction really is', () => {
    expect(() => validateOutput(output([pick('a', { why: 'A nonstop flight that avoids layovers.' })]), scored)).toThrow(/must not be described as nonstop/);
    expect(() => validateOutput(output([pick('a', { reasons: ['Direct to Lisbon.'] })]), scored)).toThrow(/must not be described as nonstop or direct/);
    expect(() => validateOutput(output([pick('b', { why: 'Nonstop both ways.' })]), scored)).not.toThrow();
    // comparing with another flight is fine
    for (const why of ['$123 cheaper than the nonstop.', 'Costs 123 USD less versus the only nonstop.', 'Beats the cheapest direct option on price.']) {
      expect(() => validateOutput(output([pick('a', { why })]), scored), why).not.toThrow();
    }
  });

  it('checks nonstop claims direction by direction', () => {
    // out: 2 stops, back: nonstop  (like OAK -> OPO)
    const mixed = scoreCandidates([cand('m', 202, { stopsOut: 2, stopsBack: 0 })], prefs);
    const ok = (why: string) => () => validateOutput(output([pick('m', { why })]), mixed);
    expect(ok('Nonstop on the way back, but two stops going out.')).not.toThrow();
    expect(ok('Direct return flight.')).not.toThrow();
    expect(ok('Direct outbound to Porto.')).toThrow(/outbound leg must not/);
    expect(ok('Nonstop out and back.')).toThrow(/nonstop/);
    expect(ok('Nonstop both ways.')).toThrow(/both ways/);
    // out: nonstop, back: 1 stop  (like SJC -> LIS)
    const other = scoreCandidates([cand('n', 316, { stopsOut: 0, stopsBack: 1 })], prefs);
    expect(() => validateOutput(output([pick('n', { why: 'Nonstop outbound, one stop back.' })]), other)).not.toThrow();
    expect(() => validateOutput(output([pick('n', { why: 'Nonstop return.' })]), other)).toThrow(/return leg must not/);
  });

  it('allows the exact difference between two picked prices, but not other numbers', () => {
    const three = scoreCandidates([cand('x', 400), cand('y', 450, { outDate: '2026-10-21' }), cand('z', 480, { outDate: '2026-10-22' })], prefs);
    const picks = (why: string) => output([pick('y', { why }), pick('z')]);
    expect(() => validateOutput(picks('$30 less than the other pick.'), three)).not.toThrow(); // 480 - 450
    expect(() => validateOutput(picks('$31 less than the other pick.'), three)).toThrow(/does not appear/);
  });
});

describe('askGroq: two attempts at most', () => {
  const reply = (body: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
  const models = { primary: 'small-model', fallback: 'big-model', effort: 'low' as const, maxTokens: 2500 };
  const used = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).model);
  const promptOf = (f: ReturnType<typeof vi.fn>, n: number) => String(JSON.parse((f.mock.calls[n][1] as RequestInit).body as string).messages[1].content);

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses one call when the cheap model answers well', async () => {
    const f = vi.fn(async () => reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['small-model']);
  });

  it('gives up after ONE call when Groq rejects the request outright (400/401)', async () => {
    for (const status of [400, 401, 403, 422]) {
      const f = vi.fn(async () => new Response('{"error":{"message":"nope"}}', { status }));
      vi.stubGlobal('fetch', f);
      expect(await askGroq('sys', 'user', scored, models)).toBeNull();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('hands over to the stronger model when the first is down, rate limited or missing', async () => {
    for (const status of [429, 500, 503, 404]) {
      const f = vi.fn().mockResolvedValueOnce(new Response('x', { status })).mockResolvedValueOnce(reply(output([pick('a')])));
      vi.stubGlobal('fetch', f);
      expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
      expect(used(f)).toEqual(['small-model', 'big-model']);
    }
  });

  it('gives a bad answer one more try on the SAME model, told why (so regular searches stay cheap)', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply(output([pick('a', { why: 'A nonstop flight.' })])))
      .mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['small-model', 'small-model']);
    expect(promptOf(f, 1)).toContain('rejected');
    expect(promptOf(f, 1)).toContain('nonstop');
  });

  it("treats Groq's 400 json_validate_failed (the model's own bad JSON) as a bad answer, not a broken request", async () => {
    const bad = new Response(JSON.stringify({ error: { message: "Error: jsonschema: '/picks/0/scores/weeksFit' expected number, but got null", code: 'json_validate_failed' } }), { status: 400 });
    const f = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    expect((await askGroq('sys', 'user', scored, models))?.picks[0].candidateId).toBe('a');
    expect(used(f)).toEqual(['small-model', 'small-model']);
    expect(promptOf(f, 1)).toContain('weeksFit');
  });

  it('stops after two bad answers, and treats cut-off JSON as a bad answer', async () => {
    const f = vi.fn(async () => reply(output([pick('missing')])));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);

    const cut = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"headline": "cut off' }, finish_reason: 'length' }] }), { status: 200 }));
    vi.stubGlobal('fetch', cut);
    expect(await askGroq('sys', 'user', scored, models)).toBeNull();
    expect(cut).toHaveBeenCalledTimes(2);
  });

  it('makes only one call when the model is down and there is no other model to try', async () => {
    const f = vi.fn(async () => new Response('x', { status: 503 }));
    vi.stubGlobal('fetch', f);
    expect(await askGroq('sys', 'user', scored, { ...models, fallback: models.primary })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uses the plan\'s reasoning effort and output cap', async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    await askGroq('sys', 'user', scored, modelPlan('deep'));
    await askGroq('sys', 'user', scored, modelPlan('regular'));
    const body = (n: number) => JSON.parse((f.mock.calls[n][1] as RequestInit).body as string);
    expect(body(0)).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_completion_tokens: 4000 });
    expect(body(1)).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low', max_completion_tokens: 2500 });
  });

  it('asks for strict structured output with room to think', async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => reply(output([pick('a')])));
    vi.stubGlobal('fetch', f);
    await askGroq('sys', 'user', scored, modelPlan('regular'));
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(2000);
    expect(body.reasoning_effort).toBe('low');
    const props = body.response_format.json_schema.schema.properties.picks.items.properties;
    expect(Object.keys(props)).not.toContain('badge'); // badges and warnings are computed from data, not asked of the model
    expect(Object.keys(props)).not.toContain('warning');
  });
});

describe('modelPlan', () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });

  it('gives regular searches the small model and deep searches the large one, each falling back to the other', () => {
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_DEEP_MODEL;
    expect(modelPlan('regular')).toMatchObject({ primary: 'openai/gpt-oss-20b', fallback: 'openai/gpt-oss-120b', effort: 'low' });
    expect(modelPlan('deep')).toMatchObject({ primary: 'openai/gpt-oss-120b', fallback: 'openai/gpt-oss-20b', maxTokens: 4000 });
    expect(modelPlan('deep').maxTokens).toBeGreaterThan(modelPlan('regular').maxTokens);
  });

  it('can be changed from the environment', () => {
    process.env.GROQ_MODEL = 'cheap-x';
    process.env.GROQ_DEEP_MODEL = 'big-y';
    expect(modelPlan('regular').primary).toBe('cheap-x');
    expect(modelPlan('deep').primary).toBe('big-y');
  });
});

describe('decorate: badges and warnings come from the data', () => {
  const four = scoreCandidates(
    [
      cand('cheap', 300, { stopsOut: 2, stopsBack: 2, minutesOut: 1300, minutesBack: 1300 }),
      cand('fast', 700, { stopsOut: 0, stopsBack: 0, minutesOut: 600, minutesBack: 600, outDate: '2026-10-21' }),
      cand('mid', 450, { outDate: '2026-10-22' }),
      cand('near', 350, { destAirport: 'OPO', isNearby: true, nearbyTransferMinutes: 170, outDate: '2026-10-23' }),
    ],
    prefs,
  );
  const byId = new Map(four.map((s) => [s.c.id, s]));
  const ai = (id: string, fit: number) => ({ ...pick(id), fit });

  it('gives Best fit to the top pick and the other badges only where true', () => {
    const out = decorate([ai('mid', 60), ai('fast', 95), ai('cheap', 70), ai('near', 50)], byId);
    const badge = Object.fromEntries(out.map((o) => [o.pick.candidateId, o.badge]));
    expect(out[0].pick.candidateId).toBe('fast'); // sorted by fit
    expect(badge.fast).toBe('Best fit');
    expect(badge.cheap).toBe('Lowest fare'); // the cheapest fare really is 'cheap'
    expect(badge.near).toBe('Nearby arrival');
    expect(badge.mid).toBeUndefined();
  });

  it('never gives Lowest fare to a pick that is not the cheapest', () => {
    const out = decorate([ai('fast', 90), ai('mid', 80)], byId);
    expect(out.map((o) => o.badge)).toEqual(['Best fit', undefined]);
  });

  it('warns only about facts we have: ground transfers and multiple stops', () => {
    const out = Object.fromEntries(decorate([ai('cheap', 1), ai('near', 2), ai('fast', 3), ai('mid', 4)], byId).map((o) => [o.pick.candidateId, o.warning]));
    expect(out.cheap).toBe('Two or more stops');
    expect(out.near).toContain('transfer');
    expect(out.fast).toBeUndefined();
    expect(out.mid).toBeUndefined();
  });
});

describe('fallbackPicks', () => {
  it('uses real numbers only', () => {
    const picks = fallbackPicks(scored);
    expect(picks.length).toBe(2);
    expect(picks.every((p) => p.reasons.length >= 2)).toBe(true);
    expect(picks.map((p) => p.why).join(' ')).toMatch(/\$(489|612)/);
  });
});
