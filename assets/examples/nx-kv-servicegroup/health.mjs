// nx-kv 探活：/api/health 返回信封且 status=ok 才算活。
const base = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || 7878);

try {
  const res = await fetch(base + '/api/health', { signal: AbortSignal.timeout(3000) });
  const payload = await res.json();
  const alive = res.ok && payload?.ok === true && payload?.data?.status === 'ok';
  console.log(JSON.stringify({ alive, detail: `HTTP ${res.status} @ ${base}/api/health → ${JSON.stringify(payload).slice(0, 200)}` }));
  process.exitCode = alive ? 0 : 1;
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ alive: false, detail: `${base}/api/health 探测失败: ${detail}` }));
  process.exitCode = 1;
}
