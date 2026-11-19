import { requireUser } from './_lib/auth.js';
import { consumeBook, refundBook } from './_lib/bookQuota.js';
import { verifyBookRef } from './_lib/bookRef.js';
import { lookupCheckout } from './_lib/booking.js';
import { HttpError, handle, json } from './_lib/http.js';

/** Looks up where to buy one flight directly. Body: { book: BookRef } exactly as it came with the route. */
export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { book?: unknown } | null;
  const ref = verifyBookRef(body?.book);
  if (!ref) throw new HttpError(400, 'BAD_REQUEST', 'That booking link is not valid. Search again.');
  await consumeBook(user.uid);
  try {
    return json(200, await lookupCheckout(ref));
  } catch (err) {
    await refundBook(user.uid);
    throw err;
  }
});
