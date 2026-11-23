// git 命令的唯一出口。
//
// 为什么单独一层：
//   - 迁移自 gitlike 时，它把 stdout 与 stderr 合成一个 buffer 再塞进错误消息。
//     这份实现把两者分开（更准），但**错误消息里仍然带上 stderr 全文**——
//     agent 看到报错要能直接定位原因。
//   - 所有 git 调用都从这里走，Windows / 路径 / 超时 / 编码只在一处处理。
//   - 外部命令失败一律用 external() 错误码（HTTP 502），与本项目的错误契约一致。
import { execFile } from 'node:child_process';
import { external } from '../errors/index.js';

export interface GitRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface GitRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export function runGit(args: string[], options: GitRunOptions = {}): Promise<GitRunResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env },
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
      },
      (err, stdout, stderr) => {
        const raw = (err as { code?: unknown } | null)?.code;
        const code = typeof raw === 'number' ? raw : err ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      }
    );
  });
}

/** 执行 git 命令，失败抛 external()（错误消息带 stderr 全文）。 */
export async function git(args: string[], options: GitRunOptions = {}): Promise<string> {
  const r = await runGit(args, options);
  if (r.code !== 0) {
    const detail = (r.stderr || r.stdout || '').trim();
    throw external(`git ${args.join(' ')} 失败: ${detail || `退出码 ${r.code}`}`);
  }
  return r.stdout;
}

/** 执行 git 命令但不抛错——用于「查得到什么算什么」的探测。 */
export async function gitTry(args: string[], options: GitRunOptions = {}): Promise<GitRunResult> {
  return runGit(args, options);
}

/** git 是否可用；不可用时给出可执行的提示而不是裸 ENOENT。 */
export async function gitAvailable(): Promise<boolean> {
  const r = await runGit(['--version'], { timeoutMs: 10_000 });
  return r.code === 0;
}

export async function gitVersion(): Promise<string> {
  const r = await runGit(['--version'], { timeoutMs: 10_000 });
  return r.code === 0 ? r.stdout.trim() : '';
}

/** 去掉尾部换行的便捷函数——git 输出几乎都要这么处理。 */
export function trimLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}
