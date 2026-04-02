// functions/api/admin/users.js
import { ok, err, requireAdmin, hashPassword, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

/* GET /api/admin/users?page=1&q=keyword */
export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const url  = new URL(request.url);
  const q    = url.searchParams.get('q') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT u.id,u.name,u.email,u.role,u.plan,u.created_at,(SELECT COUNT(*) FROM sites s WHERE s.user_id=u.id) site_count FROM users u';
  const binds = [];
  if (q) { query += ' WHERE u.name LIKE ? OR u.email LIKE ?'; binds.push(`%${q}%`, `%${q}%`); }
  query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  const total = (await env.DB.prepare(`SELECT COUNT(*) c FROM users${q ? ' WHERE name LIKE ? OR email LIKE ?' : ''}`).bind(...(q ? [`%${q}%`, `%${q}%`] : [])).first()).c;

  return ok({ users: results, total, page, pages: Math.ceil(total / limit) });
}

/* PUT /api/admin/users — 유저 수정 (role, plan 변경) */
export async function onRequestPut({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const { id, role, plan, name } = await request.json();
  if (!id) return err('id 필요');

  const fields = [];
  const binds  = [];
  if (role)  { fields.push('role=?');  binds.push(role); }
  if (plan)  { fields.push('plan=?');  binds.push(plan); }
  if (name)  { fields.push('name=?');  binds.push(name); }
  if (!fields.length) return err('변경할 필드 없음');

  binds.push(id);
  await env.DB.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).bind(...binds).run();
  return ok({ message: '업데이트 완료' });
}

/* DELETE /api/admin/users */
export async function onRequestDelete({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const { id } = await request.json();
  if (!id) return err('id 필요');
  if (id === admin.id) return err('자기 자신은 삭제할 수 없습니다.');

  await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
  return ok({ message: '삭제 완료' });
}
