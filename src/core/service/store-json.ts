// JSON 读写的小工具：读容错，写原子。
//
// 为什么单独放一个文件：core/service 下好几个模块都要读 JSON
// （服务组配置、运行态、空间索引），各自写一遍 try/catch + 临时文件 rename
// 只会让同一套语义漂移。这里定一份口径：
//   - 读：文件不存在 / 损坏 → 返回兜底值（不抛错——配置坏了不该让整个面板打不开）
//   - 写：临时文件 + rename（原子写）——中途崩了也不会留下半截文件
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 读 JSON：不存在或损坏时返回 fallback */
export function readJsonFile<T>(path: string, fallback: T): T;
export function readJsonFile<T>(path: string): T | undefined;
export function readJsonFile<T>(path: string, fallback?: T): T | undefined {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** 原子写 JSON（临时文件 + rename） */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}
