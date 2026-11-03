// 演示：优雅关停脚本（服务组的 stop 步骤）。
// 读 demo-server 写的 pid 文件，直接结束该进程。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const pidFile = join(homedir(), '.nx-nx', 'demo-server.pid');
try {
  const pid = readText(pidFile).trim();
  if (!pid) {
    warn('pid 文件为空，无进程可关');
  } else {
    const r = run('taskkill', ['/F', '/T', '/PID', pid]);
    ok(r.ok ? `已结束 demo-server (pid ${pid})` : `结束失败（可能已退出）: ${r.stderr.trim()}`);
  }
} catch {
  warn('pid 文件不存在，无进程可关');
}
