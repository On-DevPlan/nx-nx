// {{ID}} 的优雅关停脚本（服务组 stop 步骤）。
//
// 优先让服务自己退出（读它启动时写的 pid 文件）；
// 读不到再交给 stopMode 的兜底（杀端口 / 杀 pid），所以这里失败也不算致命。
import { join } from 'node:path';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const pidFile = join(homeDir(), '.nx-nx', '{{ID}}.pid');
if (!exists(pidFile)) {
  warn('pid 文件不存在（服务可能没启动过）：交给兜底策略处理');
} else {
  const text = String(await readText(pidFile)).trim();
  const pid = Number(text);
  if (!Number.isInteger(pid) || pid <= 0) {
    warn('pid 文件内容非法: ' + text);
  } else {
    try {
      process.kill(pid, 'SIGTERM');
      ok('已向 {{ID}} 发送 SIGTERM (pid ' + pid + ')');
    } catch {
      warn('进程 ' + pid + ' 已不在（可能已退出）');
    }
  }
}
