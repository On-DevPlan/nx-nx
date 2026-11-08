// 服务组域的路径与安全校验：所有「东西放哪」集中在这里。
//
// 目录布局（~/.nx-nx/ 下）：
//   service-groups.json   服务组配置（用户数据，原子写）
//   services/runtime.json 运行态（pid / 最近检测 / 自愈计数）
//   services/logs/        主脚本 IO 重定向的日志 + 事件日志
import { homedir } from 'node:os';
import { join } from 'node:path';
import { badInput } from '../errors/index.js';

const APP_DIR = join(homedir(), '.nx-nx');
const SERVICES_DIR = join(APP_DIR, 'services');

export function serviceGroupsPath(): string {
  return join(APP_DIR, 'service-groups.json');
}

export function serviceRuntimePath(): string {
  return join(SERVICES_DIR, 'runtime.json');
}

export function serviceLogsDir(): string {
  return join(SERVICES_DIR, 'logs');
}

// 每组的 HTTP 请求日志目录（client 脚本里 send() 的「一请求一日志」落这里）
export function serviceHttpLogsDir(groupId: string): string {
  return join(SERVICES_DIR, 'http-logs', groupId);
}

// 管理空间索引（空间 = 共享面板被装载后的可管理实体）
export function serviceSpacesPath(): string {
  return join(SERVICES_DIR, 'spaces.json');
}

// 组 id：小写字母数字与连字符，作为文件名与 URL 片段使用。
export function assertGroupId(id: unknown): string {
  const s = String(id ?? '').trim();
  if (!s) throw badInput('缺少服务组 id');
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(s)) {
    throw badInput(`非法服务组 id: ${s}（须为小写字母开头，仅含小写字母/数字/连字符，≤32 位）`);
  }
  return s;
}
