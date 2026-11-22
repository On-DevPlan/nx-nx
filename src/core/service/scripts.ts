// 服务组脚本命名空间：每组的 server / stop / client / shared 只住在
// ~/.nx-nx/services/groups/<id>/scripts/ 下，和全局脚本模块的 assets/scripts 完全分离。
//
// 为什么不是「在全局脚本名上加组前缀」：
//   前缀只防重名，不防串用——A 组仍能 import B 组的 shared，`script list` 仍会把
//   服务脚本当一次性脚本列出来。命名空间是目录级的隔离：解析、编辑、删除都在组内收口。
//
// 兼容存量组：旧配置里的脚本名只存在于 assets/scripts。第一次解析时把那个文件
// 惰性复制进组命名空间（之后就以组内副本为准），既不破坏旧组，也不会再出现
// 「改全局脚本把线上服务改坏」的串线。
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { badInput, conflict, notFound } from '../errors/index.js';
import { scriptsDir } from '../script/paths.js';
import { serviceScriptsDir } from './paths.js';
import { getGroup, type ServiceGroupConfig } from './store.js';

export type ServiceScriptKind = 'long' | 'short' | 'shared';
export type ServiceScriptSource = 'group' | 'external';

export interface ServiceScriptInfo {
  name: string;
  path: string;
  kind: ServiceScriptKind;
  shared: boolean;
  /** group = 组命名空间内；external = 配置里写死的包外绝对路径（只读） */
  source: ServiceScriptSource;
  size: number;
  updatedAt: number;
}

export interface ServiceScriptContent {
  groupId: string;
  name: string;
  path: string;
  content: string;
  source: ServiceScriptSource;
}

// 服务脚本名允许字母 / 数字 / . _ -（`demo.shared` 这类带点的名字要用），但绝不能带路径。
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// 组内脚本 import 的是同目录副本：aliases / _ns / lib 必须跟着脚本一起搬。
const HELPERS = ['aliases.mjs', '_ns.mjs'] as const;
const LIB_DIR = 'lib';

export function assertServiceScriptName(raw: unknown): string {
  const name = String(raw ?? '').trim().replace(/\.mjs$/i, '');
  if (!name) throw badInput('缺少服务脚本名');
  if (!NAME_RE.test(name)) {
    throw badInput(`非法服务脚本名: ${name}（只能含字母/数字/./_/-，且不能以符号开头）`);
  }
  if (name === 'aliases' || name === 'manifest') {
    throw badInput(`不能把内置文件当服务脚本: ${name}`);
  }
  return name;
}

function fileNameOf(name: string): string {
  return name.endsWith('.mjs') ? name : `${name}.mjs`;
}

// 组脚本的 helper 副本必须跟包内版本同步：aliases / _ns 升级后，旧组不能继续用旧副本。
export function ensureServiceNamespace(groupId: string): string {
  const dir = serviceScriptsDir(groupId);
  mkdirSync(dir, { recursive: true });
  const srcDir = scriptsDir();
  for (const helper of HELPERS) {
    const src = join(srcDir, helper);
    const dest = join(dir, helper);
    if (!existsSync(src)) {
      throw new Error(`内置脚本依赖缺失: ${src}`);
    }
    if (!existsSync(dest) || readFileSync(dest, 'utf8') !== readFileSync(src, 'utf8')) {
      atomicWrite(dest, readFileSync(src, 'utf8'));
    }
  }
  const srcLib = join(srcDir, LIB_DIR);
  const destLib = join(dir, LIB_DIR);
  if (existsSync(srcLib)) {
    mkdirSync(destLib, { recursive: true });
    for (const file of readdirSync(srcLib)) {
      const src = join(srcLib, file);
      if (!statSync(src).isFile()) continue;
      const dest = join(destLib, file);
      if (!existsSync(dest) || readFileSync(dest, 'utf8') !== readFileSync(src, 'utf8')) {
        atomicWrite(dest, readFileSync(src, 'utf8'));
      }
    }
  }
  return dir;
}

function atomicWrite(path: string, text: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

// 组配置里所有引用到的脚本名（main / stop / shared / space.panel / clients）。
export function serviceScriptRefs(g: ServiceGroupConfig): string[] {
  const refs = [
    g.main?.script,
    g.stop?.script,
    g.shared,
    g.space?.panel,
    ...g.clients,
  ].filter((s): s is string => Boolean(s && String(s).trim()));
  return [...new Set(refs)];
}

function isPathLike(name: string): boolean {
  return isAbsolute(name) || name.includes('/') || name.includes('\\');
}

// 把一个旧全局脚本搬进组命名空间。只搬配置明确引用的那几个，不搬整个 assets/scripts。
function migrateOne(groupId: string, raw: string): void {
  const name = assertServiceScriptName(raw);
  const dest = join(serviceScriptsDir(groupId), fileNameOf(name));
  if (existsSync(dest)) return;
  const legacy = join(scriptsDir(), fileNameOf(name));
  if (!existsSync(legacy)) return;
  copyFileSync(legacy, dest);
}

export function migrateServiceScripts(g: ServiceGroupConfig): string[] {
  ensureServiceNamespace(g.id);
  const migrated: string[] = [];
  for (const ref of serviceScriptRefs(g)) {
    if (isPathLike(ref)) continue;
    const dest = join(serviceScriptsDir(g.id), fileNameOf(assertServiceScriptName(ref)));
    if (existsSync(dest)) continue;
    migrateOne(g.id, ref);
    if (existsSync(dest)) migrated.push(dest);
  }
  return migrated;
}

export interface ResolvedServiceScript {
  name: string;
  path: string;
  source: ServiceScriptSource;
}

/**
 * 服务脚本名 → 组命名空间内的绝对路径。
 * - 路径形态（绝对路径 / 含分隔符）原样接受，标记 external：包外脚本由用户自管，不复制。
 * - 纯名字只在组命名空间里找；找不到才去旧 assets/scripts 惰性搬一次。
 */
export function resolveServiceScript(groupId: string, raw: unknown): ResolvedServiceScript {
  const text = String(raw ?? '').trim();
  if (!text) throw badInput('缺少服务脚本名');
  if (isPathLike(text)) {
    if (!isAbsolute(text)) {
      throw badInput(`包外服务脚本请用绝对路径: ${text}（组内脚本直接写名字即可）`);
    }
    if (!existsSync(text)) throw notFound(`服务脚本不存在: ${text}`);
    return { name: basename(text).replace(/\.mjs$/i, ''), path: text, source: 'external' };
  }
  const name = assertServiceScriptName(text);
  const dir = ensureServiceNamespace(groupId);
  const dest = join(dir, fileNameOf(name));
  if (existsSync(dest)) return { name, path: dest, source: 'group' };
  migrateOne(groupId, name);
  if (existsSync(dest)) return { name, path: dest, source: 'group' };
  throw notFound(`服务组 ${groupId} 的命名空间里没有脚本: ${name}（目录 ${dir}）`);
}

/** 共享面板解析：先按名字找，再补 `.shared` 后缀找一次（兼容旧写法）。 */
export function resolveServicePanel(groupId: string, raw: unknown): ResolvedServiceScript {
  const text = String(raw ?? '').trim();
  if (!text) throw badInput('缺少共享面板名');
  try {
    return resolveServiceScript(groupId, text);
  } catch (err) {
    if (text.endsWith('.shared') || text.endsWith('.mjs') || isPathLike(text)) throw err;
    return resolveServiceScript(groupId, text + '.shared');
  }
}

export function listServiceScripts(groupId: string): ServiceScriptInfo[] {
  const g = getGroup(groupId);
  const dir = ensureServiceNamespace(groupId);
  migrateServiceScripts(g);
  const names = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'aliases.mjs')
    .map((f) => f.replace(/\.mjs$/i, ''))
    .sort();
  const rows: ServiceScriptInfo[] = names.map((name) => {
    const path = join(dir, fileNameOf(name));
    const stat = statSync(path);
    const shared = name.endsWith('.shared');
    return {
      name,
      path,
      kind: shared ? 'shared' : name.endsWith('.short') ? 'short' : 'long',
      shared,
      source: 'group',
      size: stat.size,
      updatedAt: stat.mtimeMs,
    };
  });
  // 包外绝对路径的脚本：仍然列出（只读），否则配置里引用了什么在 UI 上完全看不见。
  for (const ref of serviceScriptRefs(g)) {
    if (!isPathLike(ref) || !isAbsolute(ref) || !existsSync(ref)) continue;
    const name = basename(ref).replace(/\.mjs$/i, '');
    if (rows.some((r) => r.name === name || r.path === ref)) continue;
    const stat = statSync(ref);
    const shared = name.endsWith('.shared');
    rows.push({
      name,
      path: ref,
      kind: shared ? 'shared' : name.endsWith('.short') ? 'short' : 'long',
      shared,
      source: 'external',
      size: stat.size,
      updatedAt: stat.mtimeMs,
    });
  }
  return rows;
}

export function readServiceScript(groupId: string, raw: unknown): ServiceScriptContent {
  const target = resolveServiceScript(groupId, raw);
  return {
    groupId,
    name: target.name,
    path: target.path,
    content: readFileSync(target.path, 'utf8'),
    source: target.source,
  };
}

export function saveServiceScript(groupId: string, raw: unknown, content: unknown): ServiceScriptContent {
  const target = resolveServiceScript(groupId, raw);
  if (target.source === 'external') {
    throw conflict(`包外脚本不可在服务命名空间里编辑: ${target.path}（请直接改源文件）`);
  }
  const text = String(content ?? '');
  atomicWrite(target.path, text);
  return { groupId, name: target.name, path: target.path, content: text, source: target.source };
}

export interface CreateServiceScriptInput {
  groupId: string;
  name: unknown;
  content?: unknown;
}

function defaultServiceScript(groupId: string, name: string): string {
  return [
    `// ${name} —— 服务组 ${groupId} 的脚本（组命名空间内，不登记全局脚本清单）。`,
    '// 可用内置全局函数: nx-nx script aliases',
    "import { installAliases } from './aliases.mjs';",
    '',
    'installAliases(globalThis);',
    '',
    `log(${JSON.stringify(`hello from ${groupId}/${name}`)});`,
    '',
  ].join('\n');
}

export function createServiceScript(input: CreateServiceScriptInput): ServiceScriptContent {
  const name = assertServiceScriptName(input.name);
  const dir = ensureServiceNamespace(input.groupId);
  const path = join(dir, fileNameOf(name));
  if (existsSync(path)) throw conflict(`服务组 ${input.groupId} 里已有脚本: ${name}`);
  const text = String(input.content ?? defaultServiceScript(input.groupId, name));
  writeFileSync(path, text, 'utf8');
  return { groupId: input.groupId, name, path, content: text, source: 'group' };
}

export function deleteServiceScript(groupId: string, raw: unknown): { name: string; path: string } {
  const target = resolveServiceScript(groupId, raw);
  if (target.source === 'external') {
    throw conflict(`包外脚本不可从服务命名空间删除: ${target.path}`);
  }
  const g = getGroup(groupId);
  const referenced = serviceScriptRefs(g).some((ref) => !isPathLike(ref) && assertServiceScriptName(ref) === target.name);
  if (referenced) {
    throw conflict(`脚本 ${target.name} 仍被服务组 ${groupId} 引用（main/stop/shared/clients/space），先从配置里移除`);
  }
  unlinkSync(target.path);
  return { name: target.name, path: target.path };
}

