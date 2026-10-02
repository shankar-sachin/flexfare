import { describe, expect, it } from 'vitest';
import { buildUserMessage } from './prompt';
import { scoreCandidates } from './scoring';

describe('buildUserMessage', () => {
  it('names every sub-score exactly as the answer schema does', () => {
    const [s] = scoreCandidates(
      [{ id: 'a', originAirport: 'OAK', destAirport: 'LIS', isNearby: false, nearbyTransferMinutes: 0, outDate: '2026-10-20', backDate: '2026-11-03', price: 500, airline: 'A', stopsOut: 1, stopsBack: 1, minutesOut: 800, minutesBack: 800, foundAt: 'x' }],
      { priority: 'balance', stay: 'range', hasReturn: true },
    );
    const msg = JSON.parse(buildUserMessage({ from: 'SFO', to: 'LIS', priority: 'balance', stay: 'range', hasReturn: true, pairsChecked: 49, nearby: [], candidates: [s] }));
    expect(Object.keys(msg.candidates[0].subScores).sort()).toEqual(['connections', 'price', 'travelTime', 'weeksFit']);
    expect(Object.values(msg.candidates[0].subScores).every((v) => typeof v === 'number')).toBe(true);
  });
});
