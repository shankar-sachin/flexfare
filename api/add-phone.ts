// Collects a phone number (NOT verified, no SMS) so each number belongs to one account.
// Only an HMAC hash is stored. Sets the `phoneOnFile` claim that the other endpoints check.
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireUser } from './_lib/auth.js';
import { adminAuth, db } from './_lib/firestore.js';
import { HttpError, handle, json } from './_lib/http.js';
import { hashPhone, isFakeLooking, normalizePhone } from './_lib/phone.js';

const MAX_ATTEMPTS = 5;

export const POST = handle(async (req) => {
  const user = await requireUser(req, { allowNoPhone: true });
  if (user.phoneOnFile) return json(200, { ok: true });

  const parsed = z.object({ phone: z.string().max(30) }).safeParse(await req.json().catch(() => null));
  const e164 = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!e164 || isFakeLooking(e164)) throw new HttpError(400, 'INVALID_PHONE', 'Enter a real phone number, including the country code.');

  const secret = process.env.PHONE_HASH_SECRET;
  if (!secret) throw new Error('PHONE_HASH_SECRET is not set');
  const hash = hashPhone(e164, secret);

  const firestore = db();
  const phoneRef = firestore.collection('phones').doc(hash);
  const userRef = firestore.collection('users').doc(user.uid);
  await firestore.runTransaction(async (tx) => {
    const [phoneSnap, userSnap] = await Promise.all([tx.get(phoneRef), tx.get(userRef)]);
    const attempts = (userSnap.data()?.phoneAttempts as number | undefined) ?? 0;
    if (attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many tries. Contact support to continue.');
    const owner = phoneSnap.data()?.uid as string | undefined;
    if (owner && owner !== user.uid) {
      // Throwing aborts the transaction, so the attempt counter is bumped separately below.
      throw new HttpError(409, 'PHONE_IN_USE', 'That number is already on another flexfare account.', { bump: true });
    }
    tx.set(phoneRef, { uid: user.uid, createdAt: Date.now() });
    tx.set(userRef, { phoneHash: hash }, { merge: true });
  }).catch(async (err) => {
    if (err instanceof HttpError && err.extra.bump) {
      await userRef.set({ phoneAttempts: FieldValue.increment(1) }, { merge: true });
      throw new HttpError(err.status, err.code, err.message);
    }
    throw err;
  });

  await adminAuth().setCustomUserClaims(user.uid, { phoneOnFile: true });
  return json(200, { ok: true });
});
