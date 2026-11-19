import type { CurationResult, QuotaSummary } from '../src/shared/types.js';
import { unlimitedQuota } from './_lib/admin.js';
import { requireUser } from './_lib/auth.js';
import { cacheGet, cacheSet, hashKey } from './_lib/cache.js';
import { db } from './_lib/firestore.js';
import { HttpError, clientIp, handle, json } from './_lib/http.js';
import { getWeekFares, runCuration } from './_lib/pipeline.js';
import { consumeQuota, hashIp, peekQuota, refundQuota } from './_lib/quota.js';
import { validateCurate } from './_lib/validate.js';

const CACHE_TTL_MS = 6 * 3600_000;

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => null);
  const v = validateCurate(body);
  const key = hashKey(v.cacheKey);
  // Admins have no daily limits and aren't counted; everyone else is counted as before.
  const shownQuota = async (): Promise<QuotaSummary> => (user.isAdmin ? unlimitedQuota(await peekQuota(user.uid)) : peekQuota(user.uid));

  // Same search within 6h: serve the saved answer and don't spend the user's quota.
  const cached = await cacheGet<CurationResult>('cache', key, CACHE_TTL_MS);
  if (cached) {
    return json(200, { ...cached, depth: v.depth, quota: await shownQuota() });
  }

  const ipHash = hashIp(clientIp(req));
  const quota = user.isAdmin ? null : await consumeQuota(user.uid, ipHash, v.depth);

  let result: CurationResult;
  try {
    result = await runCuration(v.query, { stay: v.stay, customStay: v.customStay, priority: v.priority, depth: v.depth });
    if (result.routes.length > 0) {
      result.weekFares = await getWeekFares(v.query.from, v.query.to).catch(() => []);
    }
  } catch (err) {
    if (!user.isAdmin) await refundQuota(user.uid, ipHash, v.depth);
    console.error('[curate] failed', err);
    throw new HttpError(502, 'UPSTREAM', 'We could not reach the fare data just now. Your search was not counted. Please try again.');
  }

  if (result.routes.length === 0 || result.aiFallback) {
    // Nothing found, or the AI step failed: not the user's fault. Don't count it, and don't cache it,
    // so trying again gets a real AI answer instead of a stored fallback for the next 6 hours.
    if (!user.isAdmin) await refundQuota(user.uid, ipHash, v.depth);
    return json(200, { ...result, depth: v.depth, quota: await shownQuota() });
  }

  await cacheSet('cache', key, result).catch((e) => console.error('[curate] cache write failed', e));
  await db()
    .collection('searches').doc(user.uid).collection('items')
    .add({ query: body, headline: result.headline, topPrice: result.routes[0].price, createdAt: Date.now() })
    .catch((e) => console.error('[curate] history write failed', e));
  return json(200, { ...result, depth: v.depth, quota: quota ?? (await shownQuota()) });
});
