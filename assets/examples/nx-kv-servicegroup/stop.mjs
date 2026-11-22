// nx-kv 没有 stop 子命令：先向本组端口的监听进程发 TERM，auto 模式再兜底。
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const port = Number(process.env.NX_SERVICE_PORT || 7878);
const isWin = process.platform === 'win32';

if (isWin) {
  const r = run('netstat', ['-ano', '-p', 'tcp']);
  const line = String(r.stdout || '')
    .split(/\r?\n/)
    .find((s) => s.includes(`:${port} `) && /LISTENING/i.test(s));
  const pid = line ? Number(line.trim().split(/\s+/).at(-1)) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) {
    warn(`端口 ${port} 没有监听进程`);
  } else {
    const killed = run('taskkill', ['/F', '/T', '/PID', String(pid)]);
    ok(`已终止 nx-kv serve (pid ${pid}, code ${killed.code})`);
  }
} else {
  const r = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  const pid = Number(String(r.stdout || '').trim().split(/\s+/)[0]);
  if (!Number.isInteger(pid) || pid <= 0) {
    warn(`端口 ${port} 没有监听进程`);
  } else {
    process.kill(pid, 'SIGTERM');
    ok(`已向 nx-kv serve 发送 SIGTERM (pid ${pid})`);
  }
}
