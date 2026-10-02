import type { CurationResult } from '../src/shared/types.js';
import { requireUser } from './_lib/auth.js';
import { cacheGet, cacheSet, hashKey } from './_lib/cache.js';
import { db } from './_lib/firestore.js';
import { HttpError, clientIp, handle, json } from './_lib/http.js';
import { getWeekFares, runCuration } from './_lib/pipeline.js';
import { consumeQuota, hashIp, limits, peekQuota, refundQuota } from './_lib/quota.js';
import { validateCurate } from './_lib/validate.js';

const CACHE_TTL_MS = 6 * 3600_000;

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => null);
  const v = validateCurate(body);
  const key = hashKey(v.cacheKey);

  // Same search within 6h: serve the saved answer and don't spend the user's quota.
  const cached = await cacheGet<CurationResult>('cache', key, CACHE_TTL_MS);
  if (cached) {
    const q = await peekQuota(user.uid);
    return json(200, { ...cached, quota: { used: q.used, limit: q.limit } });
  }

  const ipHash = hashIp(clientIp(req));
  const quota = await consumeQuota(user.uid, ipHash);

  let result: CurationResult;
  try {
    result = await runCuration(v.query, { stay: v.stay, priority: v.priority });
    if (result.routes.length > 0) {
      result.weekFares = await getWeekFares(v.query.from, v.query.to).catch(() => []);
    }
  } catch (err) {
    await refundQuota(user.uid, ipHash);
    console.error('[curate] failed', err);
    throw new HttpError(502, 'UPSTREAM', 'We could not reach the fare data just now. Your search was not counted. Please try again.');
  }

  if (result.routes.length === 0) {
    // Nothing found is not the user's fault: don't count it and don't cache it.
    await refundQuota(user.uid, ipHash);
    return json(200, { ...result, quota: { used: Math.max(0, quota.used - 1), limit: limits().user } });
  }

  await cacheSet('cache', key, result).catch((e) => console.error('[curate] cache write failed', e));
  await db()
    .collection('searches').doc(user.uid).collection('items')
    .add({ query: body, headline: result.headline, topPrice: result.routes[0].price, createdAt: Date.now() })
    .catch((e) => console.error('[curate] history write failed', e));
  return json(200, { ...result, quota: { used: quota.used, limit: quota.limit } });
});
