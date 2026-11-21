// E2E 收尾：Windows 上 Playwright 的 webServer 有时只杀掉外层 cmd，serve 进程留在
// 7999 端口，runner 因此不退出。这里按端口找进程并停掉——只作用于测试端口。
//
// 不引入额外依赖：用系统自带 PowerShell 的 Get-NetTCPConnection。
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PORT = 7999;

function systemPowerShell() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export default async function globalTeardown() {
  if (process.platform !== 'win32') return;
  try {
    const ps = systemPowerShell();
    const out = execFileSync(
      ps,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
    const pids = String(out)
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    for (const pid of pids) {
      try {
        execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${pid} -Force`], {
          timeout: 10_000,
        });
      } catch {
        // 进程可能已经自己退出：下一次跑测试前会重新起 serve
      }
    }
    if (pids.length) console.log(`[e2e] 已停掉测试端口 ${PORT} 的 serve 进程:`, pids.join(', '));
  } catch {
    // 收尾失败不该把测试结果改成失败——真正的断言结果已经在 reporter 里
  }
}
