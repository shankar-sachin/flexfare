import { describe, expect, it } from 'vitest';
import { buildDay, costOf } from './adminStats';
import { modelKey } from './claudeUsage';

describe('modelKey', () => {
  it('makes a safe field name from a model id', () => {
    expect(modelKey('claude-sonnet-5-5')).toBe('claude_sonnet_5_5');
  });
});

describe('costOf', () => {
  it('prices tokens at list price per million', () => {
    expect(costOf('claude_sonnet_5_5', 1_000_000, 1_000_000)).toBeCloseTo(12); // $2 in + $10 out
    expect(costOf('claude_opus_5_5', 2000, 500)).toBeCloseTo(0.018); // 0.008 + 0.01
    expect(costOf('claude_haiku_5_5', 1000, 400)).toBeCloseTo(0.0003);
  });

  it('gives no cost, not a wrong one, for a model it has no price for', () => {
    expect(costOf('claude_something_new', 1000, 1000)).toBeNull();
  });
});

describe('buildDay', () => {
  it('is all zeros for a day with no data', () => {
    expect(buildDay('2026-11-18', undefined, undefined)).toEqual({ day: '2026-11-18', searches: 0, claudeCalls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, models: [] });
  });

  it('adds up calls, tokens and cost across models', () => {
    const d = buildDay('2026-11-18', { count: 7 }, {
      models: {
        claude_sonnet_5_5: { calls: 4, in: 10_000, out: 3_000 },
        claude_haiku_5_5: { calls: 2, in: 2_000, out: 800 },
      },
    });
    expect(d).toMatchObject({ searches: 7, claudeCalls: 6, tokensIn: 12_000, tokensOut: 3_800 });
    expect(d.costUsd).toBeCloseTo(0.02 + 0.03 + 0.0002 + 0.0004, 4);
    expect(d.models.map((m) => m.model)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
  });

  it('leaves the day total unknown when any model has no price', () => {
    const d = buildDay('2026-11-18', undefined, { models: { claude_sonnet_5_5: { calls: 1, in: 100, out: 100 }, claude_mystery: { calls: 1, in: 100, out: 100 } } });
    expect(d.costUsd).toBeNull();
    expect(d.models.find((m) => m.model === 'claude-mystery')?.costUsd).toBeNull();
  });
});
