import { requireUser } from './_lib/auth.js';
import { adminAuth, db } from './_lib/firestore.js';
import { handle, json } from './_lib/http.js';
import { peekQuota } from './_lib/quota.js';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const quota = await peekQuota(user.uid);
  const snap = await db().collection('searches').doc(user.uid).collection('items').orderBy('createdAt', 'desc').limit(10).get();
  const recent = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, query: x.query, headline: x.headline, topPrice: x.topPrice, createdAt: x.createdAt };
  });
  return json(200, { email: user.email, ...quota, recent });
});

/** Deletes the account: search history, phone claim, and the sign-in itself. */
export const DELETE = handle(async (req) => {
  const user = await requireUser(req, { allowNoPhone: true });
  const firestore = db();
  const items = firestore.collection('searches').doc(user.uid).collection('items');
  for (;;) {
    const snap = await items.limit(400).get();
    if (snap.empty) break;
    const batch = firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const userRef = firestore.collection('users').doc(user.uid);
  const phoneHash = (await userRef.get()).data()?.phoneHash as string | undefined;
  if (phoneHash) await firestore.collection('phones').doc(phoneHash).delete();
  await userRef.delete();
  await firestore.collection('searches').doc(user.uid).delete();
  await adminAuth().deleteUser(user.uid);
  return json(200, { ok: true });
});
