// functions/api/sites/[id].js
import { ok, err, requireAuth, handleOptions } from '../../_lib/utils.js';
import { destroySite } from '../../_lib/provisioner.js';

export const onRequestOptions = () => handleOptions();

export async function onRequest({ params, request, env }) {
  const url = new URL(request.url);

  // status 폴링
  if (url.pathname.endsWith('/status')) {
    const user = await requireAuth(env, request);
    if (!user) return err('인증 필요', 401);
    const site = await env.DB.prepare(
      `SELECT id,status,wp_url,wp_admin_url,wp_username,wp_password,subdomain,custom_domain
       FROM sites WHERE id=? AND user_id=?`
    ).bind(params.id, user.id).first();
    if (!site) return err('사이트 없음', 404);
    return ok({ site });
  }

  switch (request.method) {
    case 'GET':    return getSite(params, request, env);
    case 'DELETE': return deleteSite(params, request, env);
    case 'PUT':    return updateSite(params, request, env);
    case 'OPTIONS': return handleOptions();
    default: return err('Method not allowed', 405);
  }
}

async function getSite(params, request, env) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);
  const site = await env.DB.prepare('SELECT * FROM sites WHERE id=? AND user_id=?')
    .bind(params.id, user.id).first();
  if (!site) return err('사이트 없음', 404);
  return ok({ site });
}

async function deleteSite(params, request, env) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);
  const site = await env.DB.prepare('SELECT * FROM sites WHERE id=? AND user_id=?')
    .bind(params.id, user.id).first();
  if (!site) return err('사이트 없음', 404);

  // VPS 컨테이너 삭제
  if (site.vps_container_id && site.vps_container_id !== 'demo') {
    await destroySite(env, site.vps_container_id);
  }

  // Cloudflare DNS 삭제
  if (site.custom_domain && env.CF_API_TOKEN && env.CF_ZONE_ID) {
    await deleteDNS(env, site.custom_domain);
  }

  await env.DB.prepare('DELETE FROM sites WHERE id=? AND user_id=?')
    .bind(params.id, user.id).run();
  return ok({ message: '사이트가 삭제되었습니다.' });
}

async function updateSite(params, request, env) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);
  const site = await env.DB.prepare('SELECT * FROM sites WHERE id=? AND user_id=?')
    .bind(params.id, user.id).first();
  if (!site) return err('사이트 없음', 404);

  let body;
  try { body = await request.json(); } catch { return err('잘못된 요청'); }

  const { custom_domain } = body;
  if (custom_domain) {
    if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(custom_domain))
      return err('올바른 도메인 형식이 아닙니다.');
    const dup = await env.DB.prepare(
      'SELECT id FROM sites WHERE custom_domain=? AND id!=?'
    ).bind(custom_domain, params.id).first();
    if (dup) return err('이미 다른 사이트에 연결된 도메인입니다.');

    // Cloudflare DNS CNAME 추가
    if (env.CF_API_TOKEN && env.CF_ZONE_ID) {
      const domain = env.SITE_DOMAIN || 'cloudpress.site';
      await addDNS(env, custom_domain, `${site.subdomain}.${domain}`);
    }
    await env.DB.prepare('UPDATE sites SET custom_domain=? WHERE id=?')
      .bind(custom_domain, params.id).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM sites WHERE id=?').bind(params.id).first();
  return ok({ site: updated });
}

async function addDNS(env, name, target) {
  await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'CNAME', name, content: target, proxied: true, ttl: 1 }),
  });
}

async function deleteDNS(env, name) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records?name=${name}`,
    { headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` } }
  ).then(r => r.json());
  for (const rec of r.result || []) {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records/${rec.id}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` } }
    );
  }
}
