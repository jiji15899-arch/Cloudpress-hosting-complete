// functions/api/auth/logout.js
import { ok, getToken, handleOptions } from '../../_lib/utils.js';
export const onRequestOptions = () => handleOptions();
export async function onRequestPost({ request, env }) {
  const t = getToken(request);
  if (t) await env.SESSIONS.delete(`session:${t}`);
  return ok({ message: '로그아웃 완료' });
}
