// functions/api/payments/checkout.js
import { ok, err, requireAuth, genId, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);

  const { plan } = await request.json();
  if (!plan || plan === 'free') return err('유효한 플랜을 선택해주세요.');

  // 설정에서 가격 조회
  const prices = {
    starter:    parseInt((await env.DB.prepare("SELECT value FROM settings WHERE key='plan_starter_price'").first())?.value || '9900'),
    pro:        parseInt((await env.DB.prepare("SELECT value FROM settings WHERE key='plan_pro_price'").first())?.value || '29900'),
    enterprise: parseInt((await env.DB.prepare("SELECT value FROM settings WHERE key='plan_enterprise_price'").first())?.value || '99000'),
  };

  const amount = prices[plan];
  if (!amount) return err('알 수 없는 플랜입니다.');

  const orderId = `order_${genId()}`;
  const planNames = { starter: '스타터', pro: '프로', enterprise: '엔터프라이즈' };

  // 결제 레코드 pending 상태로 생성
  await env.DB.prepare(
    'INSERT INTO payments (id,user_id,order_id,amount,plan,status) VALUES (?,?,?,?,?,?)'
  ).bind(genId(), user.id, orderId, amount, plan, 'pending').run();

  return ok({
    orderId,
    orderName: `CloudPress ${planNames[plan]} 플랜`,
    amount,
    customerName: user.name,
    customerEmail: user.email,
    tossClientKey: env.TOSS_CLIENT_KEY || '',
    plan,
  });
}
