// 内置脚本的业务真相源：列出脚本、列出内置全局函数、跑脚本。
//
// 与「项目生成」「skill 安装」这些域一样，这里只做编排：
// 脚本本身住在 assets/scripts/（纯 .mjs，零构建），解释器（_runner.mjs）也是。
// Node 侧只负责把「哪个脚本 + 哪些参数」翻译成一次子进程调用。
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { aliasesPath, listScripts, resolveScript, runnerPath, type ScriptInfo } from './paths.js';

export interface AliasInfo {
  name: string;
  group: string;
  desc: string;
}

export interface ScriptRunResult {
  script: string;
  path: string;
  code: number;
  stdout: string;
  stderr: string;
}

export function scripts(): ScriptInfo[] {
  return listScripts();
}

// 内置全局函数（别名模块）的清单——直接从 aliases.mjs 读，文档与实现同源。
export async function aliases(): Promise<AliasInfo[]> {
  const mod = (await import(pathToFileURL(aliasesPath()).href)) as { ALIASES?: AliasInfo[] };
  return Array.isArray(mod.ALIASES) ? mod.ALIASES : [];
}

// CLI/HTTP 的 flag 形态 → 子进程 argv 形态。
//   --force            → '--force'
//   --root D:\a\b      → '--root=D:\a\b'（等号连写，值里的空格不会散成两个 token）
export function flagTokens(flags: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (v === true) out.push(`--${k}`);
    else if (v === false || v === undefined || v === null) continue;
    else out.push(`--${k}=${String(v)}`);
  }
  return out;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function execNode(argv: string[], cwd?: string): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, argv, {
      cwd: cwd || process.cwd(),
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', (err) => {
      stderr += String(err.message || err);
      resolvePromise({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => {
      resolvePromise({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

// 跑一个脚本：内置脚本名，或任意 .mjs 路径。
// 脚本在自己的子进程里跑：全局副作用与崩溃都被关在那个进程里。
export async function runScript(
  name: string,
  opts: { args?: string[]; cwd?: string } = {},
): Promise<ScriptRunResult> {
  const target = resolveScript(name);
  const runner = runnerPath();
  const argv = [runner, target.path, ...(opts.args ?? [])];
  const r = await execNode(argv, opts.cwd);
  return { script: target.name, path: target.path, code: r.code, stdout: r.stdout, stderr: r.stderr };
}
