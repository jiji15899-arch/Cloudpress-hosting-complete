// functions/api/admin/revenue.js
import { ok, err, requireAdminOrManager, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestGet({ request, env }) {
  const user = await requireAdminOrManager(env, request);
  if (!user) return err('권한 필요', 403);

  const url   = new URL(request.url);
  const page  = parseInt(url.searchParams.get('page') || '1');
  const limit = 25;
  const offset = (page - 1) * limit;

  const { results: payments } = await env.DB.prepare(
    `SELECT p.*,u.name user_name,u.email user_email
     FROM payments p JOIN users u ON p.user_id=u.id
     WHERE p.status='done'
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const total = (await env.DB.prepare("SELECT COUNT(*) c FROM payments WHERE status='done'").first()).c;

  // 플랜별 매출
  const { results: byPlan } = await env.DB.prepare(
    "SELECT plan, COUNT(*) cnt, SUM(amount) total FROM payments WHERE status='done' GROUP BY plan"
  ).all();

  // 월별 매출 (최근 12개월)
  const { results: byMonth } = await env.DB.prepare(
    `SELECT strftime('%Y-%m', created_at, 'unixepoch') mo,
            COUNT(*) cnt, SUM(amount) total
     FROM payments WHERE status='done'
     GROUP BY mo ORDER BY mo DESC LIMIT 12`
  ).all();

  return ok({ payments, total, page, byPlan, byMonth });
}
