// Daily limits, enforced in one Firestore transaction: per user, per IP, and a global breaker.
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firestore.js';
import { HttpError, intEnv, nextUtcMidnight, todayKey } from './http.js';

export const limits = () => ({
  user: intEnv('DAILY_SEARCH_LIMIT', 5),
  ip: intEnv('IP_DAILY_LIMIT', 15),
  global: intEnv('GLOBAL_DAILY_LIMIT', 300),
});

export const hashIp = (ip: string) =>
  createHash('sha256').update(`${process.env.DAILY_SALT ?? ''}|${ip}`).digest('hex').slice(0, 32);

const refs = (uid: string, ipHash: string, day: string) => {
  const usage = db().collection('usage');
  return { user: usage.doc(`${uid}_${day}`), ip: usage.doc(`ip_${ipHash}_${day}`), global: usage.doc(`global_${day}`) };
};

export interface QuotaState {
  used: number;
  limit: number;
  resetsAt: string;
}

export async function peekQuota(uid: string): Promise<QuotaState> {
  const snap = await db().collection('usage').doc(`${uid}_${todayKey()}`).get();
  return { used: (snap.data()?.count as number | undefined) ?? 0, limit: limits().user, resetsAt: nextUtcMidnight() };
}

/** Spends one search. Throws 429 QUOTA_EXCEEDED (user or IP) or 503 BUSY (global). */
export async function consumeQuota(uid: string, ipHash: string): Promise<QuotaState> {
  const day = todayKey();
  const lim = limits();
  const r = refs(uid, ipHash, day);
  return db().runTransaction(async (tx) => {
    const [u, i, g] = await Promise.all([tx.get(r.user), tx.get(r.ip), tx.get(r.global)]);
    const used = (u.data()?.count as number | undefined) ?? 0;
    const resetsAt = nextUtcMidnight();
    if ((g.data()?.count ?? 0) >= lim.global) {
      throw new HttpError(503, 'BUSY', 'flexfare is at capacity today. Please try again tomorrow.', { resetsAt });
    }
    if (used >= lim.user) {
      throw new HttpError(429, 'QUOTA_EXCEEDED', `You've used all ${lim.user} searches for today.`, { resetsAt, used, limit: lim.user });
    }
    if ((i.data()?.count ?? 0) >= lim.ip) {
      throw new HttpError(429, 'QUOTA_EXCEEDED', 'Too many searches from this connection today. Try again tomorrow.', { resetsAt, used, limit: lim.user });
    }
    tx.set(r.user, { uid, date: day, count: used + 1 }, { merge: true });
    tx.set(r.ip, { date: day, count: FieldValue.increment(1) }, { merge: true });
    tx.set(r.global, { date: day, count: FieldValue.increment(1) }, { merge: true });
    return { used: used + 1, limit: lim.user, resetsAt };
  });
}

/** Gives the search back when our side failed (not the user's fault). */
export async function refundQuota(uid: string, ipHash: string): Promise<void> {
  const r = refs(uid, ipHash, todayKey());
  const batch = db().batch();
  for (const ref of [r.user, r.ip, r.global]) batch.set(ref, { count: FieldValue.increment(-1) }, { merge: true });
  await batch.commit().catch((e) => console.error('[quota] refund failed', e));
}
