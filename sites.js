// functions/api/admin/sites.js
import { ok, err, requireAdmin, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const url    = new URL(request.url);
  const q      = url.searchParams.get('q') || '';
  const page   = parseInt(url.searchParams.get('page') || '1');
  const status = url.searchParams.get('status') || '';
  const limit  = 20;
  const offset = (page - 1) * limit;

  const conds = [];
  const binds = [];
  if (q)      { conds.push('(s.name LIKE ? OR s.subdomain LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  if (status) { conds.push('s.status=?'); binds.push(status); }

  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const query = `SELECT s.*,u.name user_name,u.email user_email
    FROM sites s JOIN users u ON s.user_id=u.id${where}
    ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;

  const { results } = await env.DB.prepare(query).bind(...binds, limit, offset).all();
  const total = (await env.DB.prepare(`SELECT COUNT(*) c FROM sites s${where}`).bind(...binds).first()).c;

  return ok({ sites: results, total, page, pages: Math.ceil(total / limit) });
}

export async function onRequestDelete({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const { id } = await request.json();
  if (!id) return err('id 필요');
  await env.DB.prepare('DELETE FROM sites WHERE id=?').bind(id).run();
  return ok({ message: '삭제 완료' });
}
