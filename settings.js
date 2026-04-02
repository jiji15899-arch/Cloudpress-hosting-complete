// functions/api/admin/settings.js
import { ok, err, requireAdmin, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestGet({ request, env }) {
  // 공개 설정은 누구나 조회 가능 (가격 등)
  const { results } = await env.DB.prepare('SELECT key,value FROM settings').all();
  const cfg = Object.fromEntries((results || []).map(r => [r.key, r.value]));
  // 시크릿 키는 어드민만
  const admin = await requireAdmin(env, request);
  if (!admin) {
    delete cfg.toss_secret_key;
    delete cfg.provisioner_secret;
  }
  return ok({ settings: cfg });
}

export async function onRequestPut({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return err('어드민 권한 필요', 403);

  const { settings } = await request.json();
  if (!settings || typeof settings !== 'object') return err('잘못된 요청');

  const now = Math.floor(Date.now() / 1000);
  for (const [key, value] of Object.entries(settings)) {
    await env.DB.prepare(
      'INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=?,updated_at=?'
    ).bind(key, String(value), now, String(value), now).run();
  }
  return ok({ message: '설정 저장 완료' });
}
