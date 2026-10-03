// Daily limits, enforced in one Firestore transaction. Per user there are two allowances:
// regular searches (cheap model) and deep searches (large model). The IP and global caps count both.
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { Depth, QuotaSummary } from '../../src/shared/types.js';
import { db } from './firestore.js';
import { HttpError, intEnv, nextUtcMidnight, todayKey } from './http.js';

export const limits = () => ({
  regular: intEnv('DAILY_REGULAR_LIMIT', 4),
  deep: intEnv('DAILY_DEEP_LIMIT', 1),
  ip: intEnv('IP_DAILY_LIMIT', 15),
  global: intEnv('GLOBAL_DAILY_LIMIT', 300),
});

export const hashIp = (ip: string) =>
  createHash('sha256').update(`${process.env.DAILY_SALT ?? ''}|${ip}`).digest('hex').slice(0, 32);

const refs = (uid: string, ipHash: string, day: string) => {
  const usage = db().collection('usage');
  return { user: usage.doc(`${uid}_${day}`), ip: usage.doc(`ip_${ipHash}_${day}`), global: usage.doc(`global_${day}`) };
};

/** Field on the user's usage doc: `count` has always meant regular searches. */
const field = (depth: Depth) => (depth === 'deep' ? 'deepCount' : 'count');

const summary = (regularUsed: number, deepUsed: number): QuotaSummary => {
  const lim = limits();
  return {
    regular: { used: regularUsed, limit: lim.regular },
    deep: { used: deepUsed, limit: lim.deep },
    resetsAt: nextUtcMidnight(),
  };
};

export async function peekQuota(uid: string): Promise<QuotaSummary> {
  const d = (await db().collection('usage').doc(`${uid}_${todayKey()}`).get()).data();
  return summary((d?.count as number | undefined) ?? 0, (d?.deepCount as number | undefined) ?? 0);
}

/** Spends one search of the given kind. Throws 429 (user, deep or IP allowance) or 503 BUSY (global). */
export async function consumeQuota(uid: string, ipHash: string, depth: Depth): Promise<QuotaSummary> {
  const day = todayKey();
  const lim = limits();
  const r = refs(uid, ipHash, day);
  return db().runTransaction(async (tx) => {
    const [u, i, g] = await Promise.all([tx.get(r.user), tx.get(r.ip), tx.get(r.global)]);
    const regularUsed = (u.data()?.count as number | undefined) ?? 0;
    const deepUsed = (u.data()?.deepCount as number | undefined) ?? 0;
    const resetsAt = nextUtcMidnight();
    if ((g.data()?.count ?? 0) >= lim.global) {
      throw new HttpError(503, 'BUSY', 'flexfare is at capacity today. Please try again tomorrow.', { resetsAt });
    }
    if (depth === 'deep' && deepUsed >= lim.deep) {
      throw new HttpError(429, 'DEEP_QUOTA_EXCEEDED', "You've used your deep search for today. Regular searches still work.", { resetsAt });
    }
    if (depth === 'regular' && regularUsed >= lim.regular) {
      throw new HttpError(429, 'QUOTA_EXCEEDED', `You've used all ${lim.regular} regular searches for today.`, { resetsAt });
    }
    if ((i.data()?.count ?? 0) >= lim.ip) {
      throw new HttpError(429, 'QUOTA_EXCEEDED', 'Too many searches from this connection today. Try again tomorrow.', { resetsAt });
    }
    tx.set(r.user, { uid, date: day, [field(depth)]: (depth === 'deep' ? deepUsed : regularUsed) + 1 }, { merge: true });
    tx.set(r.ip, { date: day, count: FieldValue.increment(1) }, { merge: true });
    tx.set(r.global, { date: day, count: FieldValue.increment(1) }, { merge: true });
    return summary(regularUsed + (depth === 'regular' ? 1 : 0), deepUsed + (depth === 'deep' ? 1 : 0));
  });
}

/** Gives the search back when our side failed or nothing was found (not the user's fault). */
export async function refundQuota(uid: string, ipHash: string, depth: Depth): Promise<void> {
  const r = refs(uid, ipHash, todayKey());
  const batch = db().batch();
  batch.set(r.user, { [field(depth)]: FieldValue.increment(-1) }, { merge: true });
  batch.set(r.ip, { count: FieldValue.increment(-1) }, { merge: true });
  batch.set(r.global, { count: FieldValue.increment(-1) }, { merge: true });
  await batch.commit().catch((e) => console.error('[quota] refund failed', e));
}
