// {{ID}} 的停止脚本：请求服务自己的 /shutdown 优雅退出。
// 若服务已经不在，直接成功退出；端口/pid 兜底仍由 stopMode=auto 负责。
const base = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || {{PORT}});

try {
  const res = await fetch(base + '/shutdown', { method: 'POST', signal: AbortSignal.timeout(3000) });
  console.log(JSON.stringify({ stopped: true, detail: 'HTTP ' + res.status + ' @ ' + base + '/shutdown' }));
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ stopped: true, detail: '服务已不可达，交给兜底策略: ' + detail }));
}
