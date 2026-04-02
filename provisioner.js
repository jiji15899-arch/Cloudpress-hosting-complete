// functions/_lib/provisioner.js
// Oracle Cloud VPS 프로비저너 클라이언트

export async function provisionSite(env, { siteId, subdomain, phpVersion = '8.3' }) {
  const url  = env.PROVISIONER_URL;
  const key  = env.PROVISIONER_SECRET;

  if (!url || !key) {
    // 프로비저너 미설정 시 데모 모드
    return { demo: true };
  }

  const resp = await fetch(`${url}/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({ siteId, subdomain, phpVersion }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Provisioner error ${resp.status}: ${t}`);
  }
  return resp.json();
}

export async function destroySite(env, containerId) {
  const url = env.PROVISIONER_URL;
  const key = env.PROVISIONER_SECRET;
  if (!url || !key || !containerId) return;

  await fetch(`${url}/provision/${containerId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': key },
  }).catch(() => {});
}

export async function getSiteStatus(env, containerId) {
  const url = env.PROVISIONER_URL;
  const key = env.PROVISIONER_SECRET;
  if (!url || !key || !containerId) return { status: 'unknown' };

  const resp = await fetch(`${url}/provision/${containerId}/status`, {
    headers: { 'x-api-key': key },
  });
  if (!resp.ok) return { status: 'unknown' };
  return resp.json();
}
