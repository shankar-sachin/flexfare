// Each checkout lookup costs 1 to 2 SerpApi credits, so every user gets a small daily allowance (separate from
// their searches). The monthly credit cap in serpCredits.ts still applies on top.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firestore.js';
import { HttpError, intEnv, nextUtcMidnight, todayKey } from './http.js';

export const bookLimit = () => intEnv('BOOK_DAILY_LIMIT', 6);
const ref = (uid: string) => db().collection('usage').doc(`${uid}_${todayKey()}`);

export async function consumeBook(uid: string): Promise<void> {
  const limit = bookLimit();
  await db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref(uid))).data()?.bookCount as number | undefined) ?? 0;
    if (used >= limit) {
      throw new HttpError(429, 'BOOK_QUOTA_EXCEEDED', `You've used all ${limit} direct booking lookups for today. The links below still work.`, { resetsAt: nextUtcMidnight() });
    }
    tx.set(ref(uid), { bookCount: FieldValue.increment(1) }, { merge: true });
  });
}

/** Hands the lookup back when it failed on our side. */
export async function refundBook(uid: string): Promise<void> {
  await ref(uid).set({ bookCount: FieldValue.increment(-1) }, { merge: true }).catch(() => undefined);
}
