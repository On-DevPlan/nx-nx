// 脚本清单（assets/scripts/manifest.json）的读写。
//
// 清单管说明，目录管真相：脚本是否存在由磁盘决定，这里只负责
// 「有新脚本了给它补一条说明 / 脚本删了把说明摘掉」。
// 单独成文件是为了让「模板生成脚本」也能登记说明，而不必去导入
// core/script/service.ts 里的执行逻辑（那会把 spawn 一起拖进来）。
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scriptsDir } from './paths.js';

export interface ScriptManifestEntry {
  name: string;
  description?: string;
  usage?: string;
  notes?: string;
}

interface ManifestFile {
  scripts?: ScriptManifestEntry[];
}

function manifestPath(): string {
  return join(scriptsDir(), 'manifest.json');
}

// 清单缺失 / 损坏都当成空清单：坏文件不该让脚本域整体不可用。
function readEntries(): ScriptManifestEntry[] {
  const p = manifestPath();
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as ManifestFile;
    return Array.isArray(parsed.scripts) ? parsed.scripts : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: ScriptManifestEntry[]): void {
  const p = manifestPath();
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify({ scripts: entries }, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

// 有则更新、无则追加；顺序保持（新条目排最后，与面板列表的稳定顺序一致）。
export function upsertScriptManifest(entry: ScriptManifestEntry): void {
  const entries = readEntries().filter((e) => e.name !== entry.name);
  entries.push({
    name: entry.name,
    description: entry.description ?? '',
    usage: entry.usage ?? '',
    notes: entry.notes ?? '',
  });
  writeEntries(entries);
}

export function removeScriptManifest(name: string): void {
  writeEntries(readEntries().filter((e) => e.name !== name));
}
