import { requireUser } from './_lib/auth.js';
import { HttpError, handle, json } from './_lib/http.js';
import { getWeekFares } from './_lib/pipeline.js';

export const GET = handle(async (req) => {
  await requireUser(req);
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) throw new HttpError(400, 'BAD_REQUEST', 'Pick two different cities.');
  return json(200, { fares: await getWeekFares(from, to).catch(() => []) });
});
