// functions/_lib/utils.js
'use strict';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
export const ok  = (d = {}) => json({ ok: true,  ...d });
export const err = (msg, s = 400) => json({ ok: false, error: msg }, s);
export const handleOptions = () => new Response(null, { status: 204, headers: CORS });

export async function hashPassword(p) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(p + ':cloudpress_salt_v2')
  );
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

export function genToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2,'0')).join('');
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,9);
}

export function genPassword(len = 16) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  return [...crypto.getRandomValues(new Uint8Array(len))]
    .map(b => chars[b % chars.length]).join('');
}

export function getToken(req) {
  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(/cp_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function getSession(env, req) {
  const token = getToken(req);
  if (!token) return null;
  return env.SESSIONS.get(`session:${token}`);
}

export async function requireAuth(env, req) {
  const userId = await getSession(env, req);
  if (!userId) return null;
  const user = await env.DB.prepare(
    'SELECT id,name,email,role,plan,plan_expires_at,created_at FROM users WHERE id=?'
  ).bind(userId).first();
  return user || null;
}

export async function requireAdmin(env, req) {
  const user = await requireAuth(env, req);
  if (!user) return null;
  if (user.role !== 'admin') return null;
  return user;
}

export async function requireAdminOrManager(env, req) {
  const user = await requireAuth(env, req);
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'manager') return null;
  return user;
}

export function getDeviceType(ua = '') {
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

export async function logTraffic(env, req, userId = null) {
  try {
    const url = new URL(req.url);
    const country = req.cf?.country || 'Unknown';
    const ua = req.headers.get('user-agent') || '';
    const ref = req.headers.get('referer') || '';
    const device = getDeviceType(ua);
    await env.DB.prepare(
      'INSERT INTO traffic_logs (id,user_id,path,referrer,country,device,ua) VALUES (?,?,?,?,?,?,?)'
    ).bind(genId(), userId, url.pathname, ref, country, device, ua.slice(0,200)).run();
  } catch (_) {}
}
