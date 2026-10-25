// 文件系统原语（供 aliases.mjs 挂成全局函数）。
//
// 只依赖 node: 内置：这一层不认识 nx-nx，也不认识任何业务概念。
import fsp from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// 目录分隔符归一：脚本产出的路径统一用正斜杠，便于跨平台比较与展示。
function toPosix(p) {
  return sep === '/' ? p : p.split(sep).join('/');
}

export function exists(p) {
  return existsSync(p);
}

export function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function readText(p) {
  return fsp.readFile(p, 'utf8');
}

export async function writeText(p, text) {
  await fsp.mkdir(dirname(p), { recursive: true });
  await fsp.writeFile(p, text, 'utf8');
  return p;
}

export async function readJson(p) {
  return JSON.parse(await readText(p));
}

export async function writeJson(p, value, { pretty = true } = {}) {
  const body = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  return writeText(p, body + '\n');
}

export async function mkdirp(p) {
  await fsp.mkdir(p, { recursive: true });
  return p;
}

export async function copyFile(src, dst) {
  await fsp.mkdir(dirname(dst), { recursive: true });
  await fsp.copyFile(src, dst);
  return dst;
}

export async function removePath(p) {
  await fsp.rm(p, { recursive: true, force: true });
  return p;
}

// 递归复制并覆盖目标。exclude 里的名字（文件或目录）在源树中跳过——
// 用来跳过「安装期资产」（如 hooks.json / install/），它们不该被复制进目标。
export async function copyTree(src, dst, { exclude = [] } = {}) {
  const skip = new Set(exclude);
  async function rec(from, to) {
    await fsp.mkdir(to, { recursive: true });
    const entries = await fsp.readdir(from, { withFileTypes: true });
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const s = join(from, e.name);
      const d = join(to, e.name);
      if (e.isDirectory()) await rec(s, d);
      else if (e.isFile()) await fsp.copyFile(s, d);
    }
  }
  await rec(src, dst);
  return dst;
}

export async function listDir(p) {
  try {
    return await fsp.readdir(p);
  } catch {
    return [];
  }
}

export async function listEntries(p) {
  try {
    const entries = await fsp.readdir(p, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory(), isFile: e.isFile() }));
  } catch {
    return [];
  }
}

// 递归遍历，返回相对 root 的路径（正斜杠）。filter(rel, entry) 返回 false 则跳过该节点。
export async function walk(root, { filter, maxDepth = Infinity } = {}) {
  const out = [];
  async function rec(cur, depth) {
    for (const e of await listEntries(cur)) {
      const full = join(cur, e.name);
      const rel = toPosix(relative(root, full));
      if (filter && !filter(rel, e)) continue;
      out.push(rel);
      if (e.isDir && depth < maxDepth) await rec(full, depth + 1);
    }
  }
  await rec(root, 1);
  return out;
}

// 按正则找文件：match 可以是字符串（子串匹配）或 RegExp，匹配相对路径。
export async function findFiles(root, { match, maxDepth = Infinity } = {}) {
  const re = match instanceof RegExp ? match : match ? new RegExp(String(match).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : null;
  const files = await walk(root, {
    maxDepth,
    filter: (rel, e) => {
      if (!e.isFile) return false;
      if (!re) return true;
      return re.test(rel);
    },
  });
  return files;
}
