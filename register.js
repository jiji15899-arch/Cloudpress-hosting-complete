// functions/api/auth/register.js
import { ok, err, hashPassword, genToken, genId, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestPost({ request, env }) {
  try {
    const { name, email, password } = await request.json();
    if (!name || !email || !password) return err('이름, 이메일, 비밀번호를 입력해주세요.');
    if (password.length < 6)          return err('비밀번호는 6자 이상이어야 합니다.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('올바른 이메일 형식이 아닙니다.');

    const lc = email.toLowerCase();
    const dup = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(lc).first();
    if (dup) return err('이미 사용 중인 이메일입니다.');

    const id   = genId();
    const hash = await hashPassword(password);
    // 어드민 이메일이면 admin 역할 자동 부여
    const role = (lc === (env.ADMIN_EMAIL || 'choichoi3227@gmail.com').toLowerCase())
      ? 'admin' : 'user';

    await env.DB.prepare(
      'INSERT INTO users (id,name,email,password_hash,role,plan) VALUES (?,?,?,?,?,?)'
    ).bind(id, name.trim(), lc, hash, role, 'free').run();

    const token = genToken();
    await env.SESSIONS.put(`session:${token}`, id, { expirationTtl: 7 * 86400 });

    return ok({ token, user: { id, name: name.trim(), email: lc, role, plan: 'free' } });
  } catch (e) {
    console.error(e);
    return err('서버 오류', 500);
  }
}
