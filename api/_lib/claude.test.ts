import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askClaude, modelPlan, validatePicks, validateSummary } from './claude';
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
const picksOut = (picks: object[]) => ({ picks });

describe('validatePicks', () => {
  it('accepts a valid answer', () => {
    expect(validatePicks(picksOut([pick('a', { fit: 100 })]), scored)[0].candidateId).toBe('a');
  });

  it('rejects unknown ids, duplicate ids and malformed output', () => {
    expect(() => validatePicks(picksOut([pick('zzz')]), scored)).toThrow(/Unknown candidateId/);
    expect(() => validatePicks(picksOut([pick('a'), pick('a')]), scored)).toThrow(/twice/);
    expect(() => validatePicks({ headline: 'x' }, scored)).toThrow(/schema/);
  });

  it('says where the schema was broken, e.g. a score above 100 or a null', () => {
    expect(() => validatePicks(picksOut([pick('a', { scores: { price: 150, travelTime: 1, connections: 1, weeksFit: 1 } })]), scored)).toThrow(/picks\.0\.scores\.price.*0 to 100/);
    expect(() => validatePicks(picksOut([pick('a', { scores: { price: 1, travelTime: 1, connections: 1, weeksFit: null } })]), scored)).toThrow(/weeksFit/);
  });

  it('rejects invented dollar amounts in every format, but allows real ones', () => {
    for (const why of ['Only $321 for this.', 'Only 321 USD for this.', 'A 321-USD fare.', 'Just 321 dollars.', 'Only $ 321.']) {
      expect(() => validatePicks(picksOut([pick('a', { why })]), scored), why).toThrow(/does not appear/);
    }
    expect(() => validatePicks(picksOut([pick('a', { why: 'Costs $489, which is 123 USD under the nonstop.' })]), scored)).not.toThrow();
  });

  it('only lets a pick be called nonstop or direct if a direction really is', () => {
    expect(() => validatePicks(picksOut([pick('a', { why: 'A nonstop flight that avoids layovers.' })]), scored)).toThrow(/must not be described as nonstop/);
    expect(() => validatePicks(picksOut([pick('a', { reasons: ['Direct to Lisbon.'] })]), scored)).toThrow(/must not be described as nonstop or direct/);
    expect(() => validatePicks(picksOut([pick('b', { why: 'Nonstop both ways.' })]), scored)).not.toThrow();
    // comparing with another flight is fine
    for (const why of ['$123 cheaper than the nonstop.', 'Costs 123 USD less versus the only nonstop.', 'Beats the cheapest direct option on price.']) {
      expect(() => validatePicks(picksOut([pick('a', { why })]), scored), why).not.toThrow();
    }
  });

  it('checks nonstop claims direction by direction', () => {
    // out: 2 stops, back: nonstop  (like OAK -> OPO)
    const mixed = scoreCandidates([cand('m', 202, { stopsOut: 2, stopsBack: 0 })], prefs);
    const ok = (why: string) => () => validatePicks(picksOut([pick('m', { why })]), mixed);
    expect(ok('Nonstop on the way back, but two stops going out.')).not.toThrow();
    expect(ok('Direct return flight.')).not.toThrow();
    expect(ok('Direct outbound to Porto.')).toThrow(/outbound leg must not/);
    expect(ok('Nonstop out and back.')).toThrow(/nonstop/);
    expect(ok('Nonstop both ways.')).toThrow(/both ways/);
    // out: nonstop, back: 1 stop  (like SJC -> LIS)
    const other = scoreCandidates([cand('n', 316, { stopsOut: 0, stopsBack: 1 })], prefs);
    expect(() => validatePicks(picksOut([pick('n', { why: 'Nonstop outbound, one stop back.' })]), other)).not.toThrow();
    expect(() => validatePicks(picksOut([pick('n', { why: 'Nonstop return.' })]), other)).toThrow(/return leg must not/);
  });

  it('cannot claim anything about a return leg that is not known yet', () => {
    const unknown = scoreCandidates([cand('u', 1219, { stopsOut: 0, stopsBack: null, minutesBack: null })], prefs);
    const say = (why: string) => () => validatePicks(picksOut([pick('u', { why })]), unknown);
    expect(say('Nonstop outbound.')).not.toThrow();
    expect(say('Nonstop return.')).toThrow(/return leg must not/);
    expect(say('Nonstop both ways.')).toThrow(/both ways/);
  });

  it('allows the exact difference between two picked prices, but not other numbers', () => {
    const three = scoreCandidates([cand('x', 400), cand('y', 450, { outDate: '2026-10-21' }), cand('z', 480, { outDate: '2026-10-22' })], prefs);
    const picks = (why: string) => picksOut([pick('y', { why }), pick('z')]);
    expect(() => validatePicks(picks('$30 less than the other pick.'), three)).not.toThrow(); // 480 - 450
    expect(() => validatePicks(picks('$31 less than the other pick.'), three)).toThrow(/does not appear/);
  });
});

describe('validateSummary', () => {
  const picks = validatePicks(picksOut([pick('a'), pick('b')]), scored);
  const s = (headline: string, summary = 'Fine.') => () => validateSummary({ headline, summary }, picks, scored);

  it('holds the headline and summary to the same money rules', () => {
    expect(s('Cheapest is $489.')).not.toThrow();
    expect(s('The two picks differ by $123.')).not.toThrow(); // 612 - 489
    expect(s('Only $321.')).toThrow(/does not appear/);
    expect(s('Fine.', 'About 400 USD.')).toThrow(/does not appear/);
  });

  it('allows a nonstop claim only when a pick really is nonstop', () => {
    expect(s('A nonstop option costs $612.')).not.toThrow(); // b is nonstop
    const onlyA = validatePicks(picksOut([pick('a')]), scored);
    expect(() => validateSummary({ headline: 'A nonstop option exists.', summary: 'Fine.' }, onlyA, scored)).toThrow(/nonstop/);
    expect(() => validateSummary({ headline: '$123 cheaper than the nonstop.', summary: 'Fine.' }, onlyA, scored)).not.toThrow();
  });

  it('rejects a missing field', () => {
    expect(() => validateSummary({ headline: 'x' }, picks, scored)).toThrow(/schema/);
  });
});

describe('askClaude: two attempts per step, at most', () => {
  const plan = { primary: 'small', fallback: 'big', summary: 'tiny', effort: 'low' as const, maxTokens: 2500 };
  const summarize = () => ({ system: 'summary-system', user: 'summary-user' });
  const msg = (body: unknown, stop_reason = 'end_turn') => ({ content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason });
  const good = () => msg(picksOut([pick('a')]));
  const goodSummary = () => msg({ headline: 'Cheapest is $489.', summary: 'Fine.' });
  const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { type: 'error', message: 'x' } }, 'x', new Headers());

  function fake(...responses: (object | Error)[]) {
    const create = vi.fn();
    for (const r of responses) create.mockImplementationOnce(async () => { if (r instanceof Error) throw r; return r; });
    return { create, deps: { client: { messages: { create } } as unknown as Anthropic } };
  }
  const models = (f: ReturnType<typeof fake>) => f.create.mock.calls.map((c) => (c[0] as { model: string }).model);
  const userOf = (f: ReturnType<typeof fake>, n: number) => String((f.create.mock.calls[n][0] as { messages: { content: string }[] }).messages[0].content);

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('uses one call for the picks and one for the summary when all goes well', async () => {
    const f = fake(good(), goodSummary());
    const r = await askClaude('sys', 'user', scored, plan, summarize, f.deps);
    expect(r?.picks[0].candidateId).toBe('a');
    expect(r?.headline).toBe('Cheapest is $489.');
    expect(models(f)).toEqual(['small', 'tiny']);
    expect((f.create.mock.calls[1][0] as { system: string }).system).toBe('summary-system');
  });

  it('gives up after ONE call when Claude rejects the request outright (400/401/403/422)', async () => {
    for (const status of [400, 401, 403, 422]) {
      const f = fake(apiError(status));
      expect(await askClaude('sys', 'user', scored, plan, summarize, f.deps)).toBeNull();
      expect(f.create).toHaveBeenCalledTimes(1);
    }
  });

  it('hands over to the other model when the first is down, rate limited or missing', async () => {
    for (const status of [429, 500, 503, 529, 404]) {
      const f = fake(apiError(status), good(), goodSummary());
      expect((await askClaude('sys', 'user', scored, plan, summarize, f.deps))?.picks[0].candidateId).toBe('a');
      expect(models(f)).toEqual(['small', 'big', 'tiny']);
    }
  });

  it('treats a refusal or a dropped connection as unavailable, not as a bad answer', async () => {
    const refused = fake({ content: [], stop_reason: 'refusal' }, good(), goodSummary());
    expect((await askClaude('sys', 'user', scored, plan, summarize, refused.deps))?.picks).toHaveLength(1);
    expect(models(refused)).toEqual(['small', 'big', 'tiny']);
    const dropped = fake(new Error('socket hang up'), good(), goodSummary());
    expect(await askClaude('sys', 'user', scored, plan, summarize, dropped.deps)).not.toBeNull();
    expect(models(dropped)).toEqual(['small', 'big', 'tiny']);
  });

  it('gives a bad answer one more try on the SAME model, told why (so regular searches stay cheap)', async () => {
    const f = fake(msg(picksOut([pick('a', { why: 'A nonstop flight.' })])), good(), goodSummary());
    expect((await askClaude('sys', 'user', scored, plan, summarize, f.deps))?.picks[0].candidateId).toBe('a');
    expect(models(f)).toEqual(['small', 'small', 'tiny']);
    expect(userOf(f, 1)).toContain('rejected');
    expect(userOf(f, 1)).toContain('nonstop');
  });

  it('stops after two bad answers, and treats a cut-off answer as a bad answer', async () => {
    const bad = fake(msg(picksOut([pick('missing')])), msg(picksOut([pick('missing')])));
    expect(await askClaude('sys', 'user', scored, plan, summarize, bad.deps)).toBeNull();
    expect(bad.create).toHaveBeenCalledTimes(2);
    const cut = fake({ content: [{ type: 'text', text: '{"picks": [' }], stop_reason: 'max_tokens' }, { content: [{ type: 'text', text: '{"picks": [' }], stop_reason: 'max_tokens' });
    expect(await askClaude('sys', 'user', scored, plan, summarize, cut.deps)).toBeNull();
    expect(cut.create).toHaveBeenCalledTimes(2);
  });

  it('makes only one call when the model is down and there is no other model to try', async () => {
    const f = fake(apiError(503));
    expect(await askClaude('sys', 'user', scored, { ...plan, fallback: plan.primary }, summarize, f.deps)).toBeNull();
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the picks, without a headline, when the summary step fails', async () => {
    const f = fake(good(), apiError(400));
    const r = await askClaude('sys', 'user', scored, plan, summarize, f.deps);
    expect(r?.picks).toHaveLength(1);
    expect(r?.headline).toBeUndefined();
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it('retries a summary that quotes an invented price, on the summary model', async () => {
    const f = fake(good(), msg({ headline: 'Only $999.', summary: 'Fine.' }), goodSummary());
    const r = await askClaude('sys', 'user', scored, plan, summarize, f.deps);
    expect(r?.headline).toBe('Cheapest is $489.');
    expect(models(f)).toEqual(['small', 'tiny', 'tiny']);
    expect(userOf(f, 2)).toContain('999');
  });

  it('asks for strict structured output, sends no sampling parameters, and never lets the model write badges', async () => {
    const f = fake(good(), goodSummary());
    await askClaude('sys', 'user', scored, plan, summarize, f.deps);
    const body = f.create.mock.calls[0][0] as Record<string, any>;
    expect(body).toMatchObject({ model: 'small', max_tokens: 2500, system: 'sys', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) expect(body, key).not.toHaveProperty(key);
    const schema = body.output_config.format.schema;
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties.picks.items.properties;
    expect(Object.keys(props)).not.toContain('badge'); // badges and warnings are computed from data, not asked of the model
    expect(Object.keys(props)).not.toContain('warning');
  });

  it('does nothing without an API key or client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await askClaude('sys', 'user', scored, plan, summarize)).toBeNull();
  });
});

describe('modelPlan', () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });

  it('gives regular searches Sonnet and deep searches Opus, each falling back to the other, and Haiku the summary', () => {
    delete process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_DEEP_MODEL;
    delete process.env.CLAUDE_SUMMARY_MODEL;
    expect(modelPlan('regular')).toMatchObject({ primary: 'claude-sonnet-5-5', fallback: 'claude-opus-5-5', summary: 'claude-haiku-5-5', effort: 'low' });
    expect(modelPlan('deep')).toMatchObject({ primary: 'claude-opus-5-5', fallback: 'claude-sonnet-5-5', summary: 'claude-haiku-5-5', effort: 'medium' });
    expect(modelPlan('deep').maxTokens).toBeGreaterThan(modelPlan('regular').maxTokens);
  });

  it('can be changed from the environment', () => {
    process.env.CLAUDE_MODEL = 'cheap-x';
    process.env.CLAUDE_DEEP_MODEL = 'big-y';
    process.env.CLAUDE_SUMMARY_MODEL = 'tiny-z';
    expect(modelPlan('regular')).toMatchObject({ primary: 'cheap-x', summary: 'tiny-z' });
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

  it('warns about a long layover only when the real layover time says so', () => {
    const lay = scoreCandidates(
      [cand('long', 960, { stopsOut: 1, stopsBack: null, longestLayoverMinutes: 420 }), cand('short', 1219, { stopsOut: 1, stopsBack: null, longestLayoverMinutes: 80, outDate: '2026-10-21' })],
      prefs,
    );
    const m = new Map(lay.map((x) => [x.c.id, x]));
    const out = Object.fromEntries(decorate([ai('long', 90), ai('short', 80)], m).map((o) => [o.pick.candidateId, o.warning]));
    expect(out.long).toBe('Long layover (7h 00m)');
    expect(out.short).toBeUndefined();
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
