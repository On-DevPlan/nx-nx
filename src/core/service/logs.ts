// 服务组日志的读取：事件日志 / 主脚本 IO 日志 / HTTP 请求日志。
//
// 「服务组」页要能回答三个问题，日志就是答案的来源：
//   1. 它现在活没活？          → 状态卡（运行态）
//   2. 它刚才发生了什么？      → 事件日志（启动 / 停止 / 检测失败 / 自愈）
//   3. 请求发出去什么样？      → HTTP 请求日志（一请求一日志）
//
// 只读、不删、不改：日志是排查问题的现场，不是可以随手清理的缓存。
// 读取有上限（尾部若干行），避免把几 MB 的日志灌进面板。
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serviceHttpLogsDir, serviceLogsDir } from './paths.js';

const MAX_LINES = 200;
const MAX_BYTES = 256 * 1024;

// 读文件尾部若干行（先按字节截尾，再按行切——日志可能很大，整读会撑爆内存）
export function tailFile(path: string, maxLines = MAX_LINES): string {
  if (!existsSync(path)) return '';
  try {
    const size = statSync(path).size;
    const start = Math.max(0, size - MAX_BYTES);
    const len = Math.min(size, MAX_BYTES);
    const buf = Buffer.alloc(len);
    const fd = openSync(path, 'r');
    try {
      readSync(fd, buf, 0, len, start);
    } finally {
      closeSync(fd);
    }
    const lines = buf.toString('utf8').split(/\r?\n/);
    // 截尾可能切在半行上：丢掉第一段残行
    if (start > 0) lines.shift();
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

export interface HttpLogEntry {
  file: string;
  name: string;
  size: number;
  mtime: number;
}

/** 某组最近的 HTTP 请求日志（新→旧）。目录不存在时返回空数组。 */
export function listHttpLogs(groupId: string): HttpLogEntry[] {
  const dir = serviceHttpLogsDir(groupId);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const p = join(dir, f);
        const st = statSync(p);
        return { file: p, name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export interface GroupLogs {
  events: string;
  main: string;
  mainFile: string;
  http: HttpLogEntry[];
}

/** 一个服务组的全部日志视图。 */
export function groupLogs(groupId: string, mainFile?: string): GroupLogs {
  return {
    events: tailFile(join(serviceLogsDir(), `events-${groupId}.log`)),
    main: mainFile ? tailFile(mainFile) : '',
    mainFile: mainFile ?? '',
    http: listHttpLogs(groupId),
  };
}
