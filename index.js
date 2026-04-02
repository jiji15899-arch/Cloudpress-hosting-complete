// functions/api/sites/index.js
import { ok, err, requireAuth, genId, genPassword, handleOptions } from '../../_lib/utils.js';
import { provisionSite } from '../../_lib/provisioner.js';

export const onRequestOptions = () => handleOptions();

/* GET /api/sites */
export async function onRequestGet({ request, env }) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);

  const { results } = await env.DB.prepare(
    `SELECT id,name,subdomain,custom_domain,wp_url,wp_admin_url,
            wp_username,wp_password,status,php_version,plan,created_at,disk_usage_mb
     FROM sites WHERE user_id=? ORDER BY created_at DESC`
  ).bind(user.id).all();
  return ok({ sites: results });
}

/* POST /api/sites */
export async function onRequestPost({ request, env }) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);

  // 플랜별 사이트 수 제한
  const settingRows = await env.DB.prepare(
    "SELECT key,value FROM settings WHERE key IN ('plan_starter_sites','plan_pro_sites','plan_enterprise_sites')"
  ).all();
  const cfg = Object.fromEntries((settingRows.results || []).map(r => [r.key, parseInt(r.value)]));

  const limits = {
    free:       1,
    starter:    cfg.plan_starter_sites    || 3,
    pro:        cfg.plan_pro_sites        || 10,
    enterprise: cfg.plan_enterprise_sites || -1,
  };
  const limit = limits[user.plan] ?? 1;

  if (limit !== -1) {
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM sites WHERE user_id=?'
    ).bind(user.id).all();
    if (existing.length >= limit)
      return err(`현재 플랜(${user.plan})의 최대 사이트 수(${limit}개)에 도달했습니다.`);
  }

  let body;
  try { body = await request.json(); } catch { return err('잘못된 요청'); }

  const { name, subdomain } = body;
  if (!name || !subdomain) return err('사이트 이름과 서브도메인을 입력해주세요.');
  if (!/^[a-z0-9-]{3,30}$/.test(subdomain))
    return err('서브도메인은 3~30자 영소문자·숫자·하이픈만 허용합니다.');

  const dup = await env.DB.prepare('SELECT id FROM sites WHERE subdomain=?').bind(subdomain).first();
  if (dup) return err('이미 사용 중인 서브도메인입니다.');

  const siteId  = genId();
  const dbName  = `wp_${siteId.slice(0, 12)}`;
  const dbUser  = `u_${siteId.slice(0, 10)}`;
  const dbPass  = genPassword(20);
  const domain  = env.SITE_DOMAIN || 'cloudpress.site';
  const phpVer  = body.php_version || '8.3';

  await env.DB.prepare(
    `INSERT INTO sites (id,user_id,name,subdomain,status,php_version,plan,db_name,db_user,db_password)
     VALUES (?,?,?,?,'provisioning',?,?,?,?,?)`
  ).bind(siteId, user.id, name.trim(), subdomain, phpVer, user.plan, dbName, dbUser, dbPass).run();

  // 비동기 프로비저닝 시작
  kickoffProvisioning(env, siteId, subdomain, name, phpVer, dbName, dbUser, dbPass, domain).catch(console.error);

  return ok({
    site: {
      id: siteId, user_id: user.id, name: name.trim(), subdomain,
      status: 'provisioning', php_version: phpVer, plan: user.plan,
      created_at: Math.floor(Date.now() / 1000),
    }
  });
}

async function kickoffProvisioning(env, siteId, subdomain, siteName, phpVer, dbName, dbUser, dbPass, domain) {
  try {
    const result = await provisionSite(env, { siteId, subdomain, phpVersion: phpVer });

    if (result.demo) {
      // 데모 모드 — VPS 없이 가짜 크리덴셜
      await sleep(4000);
      const wpPass = genPassword();
      await env.DB.prepare(
        `UPDATE sites SET status='active',
          wp_url=?,wp_admin_url=?,wp_username='admin',wp_password=?,
          vps_container_id='demo'
         WHERE id=?`
      ).bind(
        `https://${subdomain}.${domain}`,
        `https://${subdomain}.${domain}/wp-admin`,
        wpPass, siteId
      ).run();
      return;
    }

    // VPS 프로비저너가 크리덴셜 반환
    const { containerId, wpUrl, wpAdminUrl, wpUsername, wpPassword } = result;
    await env.DB.prepare(
      `UPDATE sites SET status='active',
        vps_container_id=?,wp_url=?,wp_admin_url=?,wp_username=?,wp_password=?
       WHERE id=?`
    ).bind(containerId, wpUrl, wpAdminUrl, wpUsername, wpPassword, siteId).run();

  } catch (e) {
    console.error('Provisioning failed:', e);
    await env.DB.prepare("UPDATE sites SET status='error' WHERE id=?").bind(siteId).run();
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
