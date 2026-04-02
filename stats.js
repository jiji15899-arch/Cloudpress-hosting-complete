// functions/api/admin/stats.js
import { ok, err, requireAdmin, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한이 필요합니다.', 403);

  const now   = Math.floor(Date.now() / 1000);
  const day   = now - 86400;
  const week  = now - 7  * 86400;
  const month = now - 30 * 86400;
  const year  = now - 365 * 86400;

  const [
    totalUsers, totalSites, activeSites,
    sitesToday, sitesWeek, sitesMonth, sitesYear,
    totalRevenue, revenueMonth,
    recentPayments,
    countryStats, deviceStats,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) c FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) c FROM sites').first(),
    env.DB.prepare("SELECT COUNT(*) c FROM sites WHERE status='active'").first(),

    env.DB.prepare('SELECT COUNT(*) c FROM sites WHERE created_at>?').bind(day).first(),
    env.DB.prepare('SELECT COUNT(*) c FROM sites WHERE created_at>?').bind(week).first(),
    env.DB.prepare('SELECT COUNT(*) c FROM sites WHERE created_at>?').bind(month).first(),
    env.DB.prepare('SELECT COUNT(*) c FROM sites WHERE created_at>?').bind(year).first(),

    env.DB.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='done'").first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='done' AND created_at>?").bind(month).first(),

    env.DB.prepare(
      "SELECT p.order_id,p.amount,p.plan,p.method,p.created_at,u.name,u.email FROM payments p JOIN users u ON p.user_id=u.id WHERE p.status='done' ORDER BY p.created_at DESC LIMIT 10"
    ).all(),

    env.DB.prepare(
      'SELECT country, COUNT(*) cnt FROM traffic_logs GROUP BY country ORDER BY cnt DESC LIMIT 10'
    ).all(),
    env.DB.prepare(
      'SELECT device, COUNT(*) cnt FROM traffic_logs GROUP BY device ORDER BY cnt DESC'
    ).all(),
  ]);

  // 일별 사이트 생성 (최근 30일)
  const { results: dailySites } = await env.DB.prepare(
    `SELECT date(created_at,'unixepoch') d, COUNT(*) c
     FROM sites WHERE created_at>? GROUP BY d ORDER BY d`
  ).bind(month).all();

  return ok({
    users:          totalUsers.c,
    sites:          totalSites.c,
    activeSites:    activeSites.c,
    sitesToday:     sitesToday.c,
    sitesWeek:      sitesWeek.c,
    sitesMonth:     sitesMonth.c,
    sitesYear:      sitesYear.c,
    totalRevenue:   totalRevenue.s,
    revenueMonth:   revenueMonth.s,
    recentPayments: recentPayments.results,
    countryStats:   countryStats.results,
    deviceStats:    deviceStats.results,
    dailySites,
  });
}
