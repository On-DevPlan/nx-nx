// 系统 / 参数原语（供 aliases.mjs 挂成全局函数）。
//
// 只依赖 node: 内置：这一层不认识 nx-nx，也不认识任何业务概念。
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';

export function homeDir() {
  return homedir();
}

export function tmpDir() {
  return tmpdir();
}

export function cwd() {
  return process.cwd();
}

export function env(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined ? fallback : v;
}

export function setEnv(name, value) {
  if (value === undefined || value === null) delete process.env[name];
  else process.env[name] = String(value);
  return process.env[name];
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function now() {
  return new Date().toISOString();
}

// 解析命令行参数：--key=value / --key value / --flag / 位置参数。
// 返回 { _: 位置参数[], flags: { key: 值 } }；'--' 之后全部当位置参数。
export function parseArgs(argv = []) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      out.flags[a.slice(1)] = true;
      continue;
    }
    out._.push(a);
  }
  return out;
}

// 解析绝对路径（相对当前工作目录）。
export function absPath(p) {
  return resolve(String(p));
}
