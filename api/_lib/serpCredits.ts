// SerpApi bills one credit per search. This counts credits per calendar month in Firestore and refuses
// to go past SERPAPI_MONTHLY_LIMIT (default 100, the free plan), so a busy day can't cause overage.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firestore.js';
import { HttpError, intEnv } from './http.js';

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export async function reserveCredits(n: number): Promise<void> {
  if (n <= 0) return;
  const limit = intEnv('SERPAPI_MONTHLY_LIMIT', 100);
  const ref = db().collection('usage').doc(`serpapi_${monthKey()}`);
  await db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    if (used + n > limit) {
      throw new HttpError(503, 'BUSY', 'Live fares are at capacity this month. Please try again next month.');
    }
    tx.set(ref, { count: FieldValue.increment(n), month: monthKey() }, { merge: true });
  });
}

/** Hands credits back when a search failed before SerpApi counted it. */
export async function refundCredits(n: number): Promise<void> {
  if (n <= 0) return;
  await db().collection('usage').doc(`serpapi_${monthKey()}`).set({ count: FieldValue.increment(-n) }, { merge: true }).catch(() => undefined);
}
