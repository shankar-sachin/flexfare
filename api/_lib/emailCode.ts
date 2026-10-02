import { FieldValue } from 'firebase-admin/firestore';
import { db, adminAuth } from './firestore.js';
import { HttpError, intEnv, nextUtcMidnight, todayKey } from './http.js';
import { CODE_TTL_MS, checkCode, planSend, type CodeDoc } from './emailCodeLogic.js';
import { sendEmail, verificationCodeEmail } from './mailer.js';

const secret = () => {
  const s = process.env.EMAIL_CODE_SECRET;
  if (!s) throw new Error('EMAIL_CODE_SECRET is not set');
  return s;
};
const ref = (uid: string) => db().collection('emailCodes').doc(uid);

/** Sends a code unless one was sent in the last minute (so a page reload or double click is harmless). */
export async function sendEmailCode(uid: string, email: string): Promise<{ sent: boolean; retryAfter: number }> {
  const day = todayKey();
  const globalRef = db().collection('usage').doc(`emailsent_${day}`);
  const now = Date.now();

  const plan = await db().runTransaction(async (tx) => {
    const [snap, g] = await Promise.all([tx.get(ref(uid)), tx.get(globalRef)]);
    const p = planSend(snap.data() as CodeDoc | undefined, uid, secret(), now);
    if (p.action !== 'send') return p;
    if ((g.data()?.count ?? 0) >= intEnv('EMAIL_DAILY_LIMIT', 250)) {
      throw new HttpError(503, 'BUSY', 'We are sending too many emails today. Please try again tomorrow.', { resetsAt: nextUtcMidnight() });
    }
    tx.set(ref(uid), p.doc);
    tx.set(globalRef, { date: day, count: FieldValue.increment(1) }, { merge: true });
    return p;
  });

  if (plan.action === 'wait') return { sent: false, retryAfter: plan.retryAfter };
  if (plan.action === 'limit') {
    throw new HttpError(429, 'TOO_MANY_SENDS', "You've asked for too many codes. Try again in a while.", { retryAfter: plan.retryAfter });
  }
  try {
    await sendEmail({ ...verificationCodeEmail(plan.code, CODE_TTL_MS / 60_000), to: email });
  } catch (err) {
    console.error('[email-code] send failed', err instanceof Error ? err.message : err);
    await ref(uid).set({ sentAt: 0 }, { merge: true }); // let them retry straight away
    throw new HttpError(502, 'EMAIL_FAILED', 'We could not send the email. Please try again in a moment.');
  }
  return { sent: true, retryAfter: 60 };
}

/** Checks a code and, if right, marks the account's email as verified. */
export async function verifyEmailCode(uid: string, code: string): Promise<void> {
  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref(uid));
    const doc = snap.data() as CodeDoc | undefined;
    const result = checkCode(doc, uid, code, secret(), Date.now());
    if (result === 'wrong') tx.update(ref(uid), { attempts: FieldValue.increment(1) });
    if (result === 'ok') tx.delete(ref(uid));
    return result;
  });
  if (outcome === 'expired') throw new HttpError(400, 'CODE_EXPIRED', 'That code has expired. Send a new one.');
  if (outcome === 'locked') throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Send a new one.');
  if (outcome === 'wrong') throw new HttpError(400, 'INVALID_CODE', "That code didn't match.");
  await adminAuth().updateUser(uid, { emailVerified: true });
}
