// functions/api/payments/confirm.js
import { ok, err, requireAuth, handleOptions } from '../../_lib/utils.js';

export const onRequestOptions = () => handleOptions();

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(env, request);
  if (!user) return err('인증 필요', 401);

  const { paymentKey, orderId, amount } = await request.json();
  if (!paymentKey || !orderId || !amount) return err('결제 정보가 누락되었습니다.');

  // 결제 레코드 조회
  const payment = await env.DB.prepare(
    "SELECT * FROM payments WHERE order_id=? AND user_id=? AND status='pending'"
  ).bind(orderId, user.id).first();
  if (!payment) return err('유효하지 않은 결제 요청입니다.');
  if (payment.amount !== parseInt(amount)) return err('결제 금액이 일치하지 않습니다.');

  // Toss 서버에 결제 승인 요청
  const secretKey = env.TOSS_SECRET_KEY;
  if (!secretKey) return err('결제 키가 설정되지 않았습니다.', 500);

  const encoded = btoa(`${secretKey}:`);
  const tossResp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const tossData = await tossResp.json();

  if (!tossResp.ok) {
    // 결제 실패 처리
    await env.DB.prepare(
      "UPDATE payments SET status='failed' WHERE order_id=?"
    ).bind(orderId).run();
    return err(tossData.message || '결제 승인에 실패했습니다.', 400);
  }

  // 결제 성공 처리
  const now = Math.floor(Date.now() / 1000);
  const method = tossData.method || '';
  const cardCompany = tossData.card?.company || tossData.easyPay?.provider || '';
  const receiptUrl = tossData.receipt?.url || '';

  await env.DB.prepare(
    `UPDATE payments SET
       status='done', payment_key=?, method=?, card_company=?, receipt_url=?, confirmed_at=?
     WHERE order_id=?`
  ).bind(paymentKey, method, cardCompany, receiptUrl, now, orderId).run();

  // 유저 플랜 업그레이드 (30일)
  const expiresAt = now + 30 * 86400;
  await env.DB.prepare(
    'UPDATE users SET plan=?, plan_expires_at=? WHERE id=?'
  ).bind(payment.plan, expiresAt, user.id).run();

  return ok({
    message: '결제가 완료되었습니다.',
    plan: payment.plan,
    expiresAt,
    receiptUrl,
  });
}
