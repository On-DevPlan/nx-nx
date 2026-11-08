// 服务组的配置与运行态存储。
//
// 与 core/store.ts 的通用 store 分开：服务组是脚本域的编排数据，
// 独立文件避免把「进程 pid」这类易变状态写进用户主 store。
// 写入沿用原子写（临时文件 + rename）模式。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  serviceGroupsPath,
  serviceRuntimePath,
} from './paths.js';

// ---- 配置模型 ----

// 一步启动：脚本名（assets/scripts/ 下，可含 .shared）+ 参数
export interface StepConfig {
  script: string;
  args: string[];
}

// 活性检测：端口可连 / HTTP 可响应
export interface HealthConfig {
  kind: 'port' | 'http';
  port: number;
  host: string; // 默认 127.0.0.1
  path: string; // http 检测路径，默认 /
  intervalMs: number; // 检测间隔，默认 5000
  failThreshold: number; // 连续失败 N 次判定失活，默认 3
  onDead: 'restart' | 'none'; // 失活处理，默认 restart（自愈：stop → start）
}

export interface ServiceGroupConfig {
  id: string;
  name: string;
  main?: StepConfig; // 主脚本（长驻服务）
  stop?: StepConfig; // 优雅关停脚本（可选；没有则直接杀进程/端口）
  killPort?: number; // stop 兜底：杀掉占用该端口的进程
  health?: HealthConfig;
  shared?: string; // 共享函数面板脚本名（如 demo.shared），组内脚本执行时自动装载
  space?: SpaceConfig; // 管理空间：面板 + 启动前的 bool check 方法
  clients: string[]; // client 脚本名列表（流水线的次步骤，依次执行）
}

// 管理空间配置：
//   panel —— 空间面板脚本名（共享面板）；为空则沿用 shared
//   check —— 空间里那个返回 bool 的方法名；执行 server 前先调它
export interface SpaceConfig {
  panel?: string;
  check?: string;
}

// 空间 check 的默认方法名（配置没写 space.check 时用这个）
export const DEFAULT_CHECK_METHOD = 'checkUp';

export interface GroupRuntime {
  status: 'stopped' | 'running';
  pid?: number;
  startedAt?: number;
  logFile?: string;
  lastCheckAt?: number;
  alive?: boolean;
  detail?: string;
  failStreak: number;
  restarts: number;
  lastEvent?: string;
}

export function defaultRuntime(): GroupRuntime {
  return { status: 'stopped', failStreak: 0, restarts: 0 };
}

// ---- 配置读写 ----

export function loadGroups(): ServiceGroupConfig[] {
  const p = serviceGroupsPath();
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { groups?: ServiceGroupConfig[] };
    return Array.isArray(parsed.groups) ? parsed.groups : [];
  } catch {
    return [];
  }
}

export function saveGroups(groups: ServiceGroupConfig[]): void {
  writeAtomic(serviceGroupsPath(), JSON.stringify({ groups }, null, 2) + '\n');
}

export function getGroup(id: string): ServiceGroupConfig {
  const g = loadGroups().find((x) => x.id === id);
  if (!g) throw new Error(`服务组不存在: ${id}（nx-nx sg list 查看）`);
  return g;
}

// 校验 + 补默认值。set 入口的唯一通道。
export function normalizeGroup(raw: unknown, id: string): ServiceGroupConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) {
    throw new Error('服务组缺少 name');
  }
  const step = (v: unknown): StepConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;
    if (typeof s.script !== 'string' || !s.script.trim()) return undefined;
    return {
      script: s.script,
      args: Array.isArray(s.args) ? s.args.map(String) : [],
    };
  };
  const h = (v: unknown): HealthConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;
    const port = Number(s.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`health.port 非法: ${String(s.port)}`);
    }
    const kind = s.kind === 'http' ? 'http' : 'port';
    if (kind === 'http' && typeof s.host !== 'string') {
      throw new Error('health.kind=http 时必须提供 host');
    }
    return {
      kind,
      port,
      host: typeof s.host === 'string' && s.host ? s.host : '127.0.0.1',
      path: typeof s.path === 'string' && s.path ? s.path : '/',
      intervalMs: clamp(Number(s.intervalMs) || 5000, 1000, 600000),
      failThreshold: clamp(Number(s.failThreshold) || 3, 1, 100),
      onDead: s.onDead === 'none' ? 'none' : 'restart',
    };
  };

  const space = (v: unknown): SpaceConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;
    const panel = typeof s.panel === 'string' && s.panel.trim() ? s.panel.trim() : undefined;
    const check = typeof s.check === 'string' && s.check.trim() ? s.check.trim() : undefined;
    if (!panel && !check) return undefined;
    return { panel, check };
  };

  const cfg: ServiceGroupConfig = {
    id,
    name: String(r.name).trim(),
    main: step(r.main),
    stop: step(r.stop),
    killPort: Number.isInteger(r.killPort) ? (r.killPort as number) : undefined,
    health: h(r.health),
    shared: typeof r.shared === 'string' && r.shared.trim() ? r.shared.trim() : undefined,
    space: space(r.space),
    clients: Array.isArray(r.clients) ? r.clients.map(String) : [],
  };
  return cfg;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---- 运行态读写 ----

export function loadRuntimeAll(): Record<string, GroupRuntime> {
  const p = serviceRuntimePath();
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Record<string, GroupRuntime>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRuntimeAll(all: Record<string, GroupRuntime>): void {
  writeAtomic(serviceRuntimePath(), JSON.stringify(all, null, 2) + '\n');
}

export function loadRuntime(id: string): GroupRuntime {
  return loadRuntimeAll()[id] ?? defaultRuntime();
}

export function patchRuntime(id: string, patch: Partial<GroupRuntime>): GroupRuntime {
  const all = loadRuntimeAll();
  const next = { ...defaultRuntime(), ...all[id], ...patch };
  all[id] = next;
  saveRuntimeAll(all);
  return next;
}

// 先写临时文件再改名（与 core/script/service.ts 的 atomicWrite 同款语义）
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}
