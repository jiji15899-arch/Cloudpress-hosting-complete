// functions/api/auth/login.js
import { ok, err, hashPassword, genToken, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return err('이메일과 비밀번호를 입력해주세요.');

    const user = await env.DB.prepare('SELECT * FROM users WHERE email=?')
      .bind(email.toLowerCase()).first();
    if (!user) return err('이메일 또는 비밀번호가 올바르지 않습니다.');

    const hash = await hashPassword(password);
    if (hash !== user.password_hash) return err('이메일 또는 비밀번호가 올바르지 않습니다.');

    const token = genToken();
    await env.SESSIONS.put(`session:${token}`, user.id, { expirationTtl: 7 * 86400 });

    return ok({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan } });
  } catch (e) {
    return err('서버 오류', 500);
  }
}
