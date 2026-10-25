// 进程 / 命令执行原语（供 aliases.mjs 挂成全局函数）。
//
// 只依赖 node: 内置：这一层不认识 nx-nx，也不认识任何业务概念。
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

const MAX_BUFFER = 32 * 1024 * 1024;

// 执行一个命令（不走 shell），返回 { code, ok, stdout, stderr }。
// 失败不抛异常：脚本自己决定「非零退出码算不算 fatal」。
export function run(cmd, args = [], opts = {}) {
  const { cwd, env, input, timeout } = opts;
  const r = spawnSync(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    input,
    encoding: 'utf8',
    timeout,
    shell: false,
    maxBuffer: MAX_BUFFER,
  });
  return {
    code: typeof r.status === 'number' ? r.status : 1,
    ok: r.status === 0 && !r.error,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? String(r.error.message || r.error) : ''),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

// 走 shell 执行一行命令（cmd.exe / sh 由平台决定）。
export function sh(cmdLine, opts = {}) {
  const { cwd, env, input, timeout } = opts;
  const r = spawnSync(cmdLine, [], {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    input,
    encoding: 'utf8',
    timeout,
    shell: true,
    maxBuffer: MAX_BUFFER,
  });
  return {
    code: typeof r.status === 'number' ? r.status : 1,
    ok: r.status === 0 && !r.error,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? (r.error ? String(r.error.message || r.error) : ''),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

// 在 PATH 里找可执行文件；找不到返回 null。
export function which(bin) {
  if (!bin) return null;
  const pathEnv = process.env.PATH || '';
  const exts = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  for (const d of dirs) {
    for (const ext of ['', ...exts]) {
      const full = join(d, bin + ext);
      try {
        if (!isAbsolute(full)) continue;
        if (statSync(full).isFile()) return full;
      } catch {
        /* 继续找下一个 */
      }
    }
  }
  return null;
}
