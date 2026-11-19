import { requireUser } from './_lib/auth.js';
import { getAdminStats } from './_lib/adminStats.js';
import { HttpError, handle, json } from './_lib/http.js';

/** Live usage numbers for the admin page. Admin accounts only (ADMIN_EMAILS, verified email). */
export const GET = handle(async (req) => {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new HttpError(403, 'FORBIDDEN', 'This page is for admins.');
  return json(200, await getAdminStats());
});
