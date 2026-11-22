// {{ID}} 的探活脚本：确认主脚本的 /health 仍在响应。
// 退出码 0 = 活；非 0 = 失活。最后一行 JSON 会被面板作为检测详情展示。
const base = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || {{PORT}});

try {
  const res = await fetch(base + '/health', { signal: AbortSignal.timeout(3000) });
  const body = await res.text();
  const alive = res.ok;
  console.log(JSON.stringify({ alive, detail: 'HTTP ' + res.status + ' @ ' + base + '/health → ' + body.slice(0, 160) }));
  process.exitCode = alive ? 0 : 1;
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ alive: false, detail: base + '/health 探测失败: ' + detail }));
  process.exitCode = 1;
}
