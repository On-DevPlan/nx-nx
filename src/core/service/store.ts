// 服务组的配置与运行态存储。
//
// 与 core/store.ts 的通用 store 分开：服务组是脚本域的编排数据，
// 独立文件避免把「进程 pid」这类易变状态写进用户主 store。
// 写入沿用原子写（临时文件 + rename）模式。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  serviceGroupDir,
  serviceGroupsPath,
  serviceRuntimePath,
} from './paths.js';

// ---- 配置模型 ----

// 一步启动：脚本名（组命名空间 services/groups/<id>/scripts 下，可含 .shared；包外脚本用绝对路径）+ 参数
export interface StepConfig {
  script: string;
  args: string[];
}

// 停止策略（stopMode）——「关闭」这一个动作的四种走法：
//   auto   依次兜底：关停脚本 → 杀端口占用进程 → 杀记录的 pid（默认，向后兼容旧行为）
//   script 只跑组内关停脚本（服务自己有优雅退出协议时用）
//   port   直接杀占用端口的进程（用户点名的默认选项：「直接关闭端口所在进程」）
//   pid    只杀运行态记录的 pid（端口被别的进程占用时，避免误杀）
export type StopMode = 'auto' | 'script' | 'port' | 'pid';
export const STOP_MODES: readonly StopMode[] = ['auto', 'script', 'port', 'pid'];

// 活性检测：端口可连 / HTTP 可响应
export interface HealthConfig {
  kind: 'port' | 'http';
  port: number;
  host: string; // 默认 127.0.0.1
  path: string; // http 检测路径，默认 /
  intervalMs: number; // 检测间隔，默认 5000
  failThreshold: number; // 连续失败 N 次判定失活，默认 3
  readyTimeoutMs: number; // 启动后等就绪的上限，默认 20000（java -jar 冷启动要放宽）
  onDead: 'restart' | 'none'; // 失活处理，默认 restart（自愈：stop → start）
}

// 启动参数：让同一个服务按不同版本启动（端口 / 配置文件 / 环境变量）。
//   key     —— 表单值对象里的键
//   arg     —— 有值时追加成 `--<arg> <value>`（已有同名 flag 会被替换）
//   env     —— 有值时注入同名环境变量
//   type    —— 面板渲染成输入框 / 数字框 / 下拉列表
export type LaunchParamType = 'text' | 'number' | 'select';

export interface LaunchParam {
  key: string;
  label: string;
  type: LaunchParamType;
  options?: string[];
  default?: string;
  arg?: string;
  env?: string;
  placeholder?: string;
  description?: string;
}

// 命名预设：一次点击填好一组参数（默认 / 预发 / 生产…），字段仍可手改。
export interface LaunchProfile {
  name: string;
  values: Record<string, string>;
}

export interface LaunchConfig {
  params: LaunchParam[];
  profiles?: LaunchProfile[];
}

export interface ServiceGroupConfig {
  id: string;
  name: string;
  /** 一段人话说明：这个服务是干什么的（首页展示 desc 用） */
  desc?: string;
  /** 这个服务自己的工作目录；启动进程的 cwd，也是 client 产物/临时文件的落点 */
  cwd?: string;
  main?: StepConfig; // 主脚本（长驻服务）
  stop?: StepConfig; // 优雅关停脚本（可选；没有则直接杀进程/端口）
  killPort?: number; // stop 兜底：杀掉占用该端口的进程
  stopMode: StopMode; // 关闭动作的走法，默认 auto
  health?: HealthConfig;
  shared?: string; // 共享函数面板脚本名（如 demo.shared），组内脚本执行时自动装载
  space?: SpaceConfig; // 管理空间：面板 + 启动前的 bool check 方法
  clients: string[]; // client 脚本名列表（流水线的次步骤，依次执行）
  launch?: LaunchConfig; // 启动版本参数（端口 / 配置文件 / 环境）
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
  /** 上一次实际使用的启动参数；自愈重启会沿用这一组，不会退回默认端口 */
  launch?: Record<string, string>;
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
      readyTimeoutMs: clamp(Number(s.readyTimeoutMs) || 20000, 1000, 600000),
      onDead: s.onDead === 'none' ? 'none' : 'restart',
    };
  };

  const stopMode = (v: unknown): StopMode => {
    if (v === undefined || v === null || v === '') return 'auto';
    const m = String(v) as StopMode;
    if (!STOP_MODES.includes(m)) {
      throw new Error(`stopMode 非法: ${String(v)}（可选 ${STOP_MODES.join(' / ')}）`);
    }
    return m;
  };

  const space = (v: unknown): SpaceConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;
    const panel = typeof s.panel === 'string' && s.panel.trim() ? s.panel.trim() : undefined;
    const check = typeof s.check === 'string' && s.check.trim() ? s.check.trim() : undefined;
    if (!panel && !check) return undefined;
    return { panel, check };
  };

  const launch = (v: unknown): LaunchConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;
    const params: LaunchParam[] = [];
    if (Array.isArray(s.params)) {
      for (const item of s.params) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        const key = typeof p.key === 'string' ? p.key.trim() : '';
        if (!key) continue;
        const type = p.type === 'number' || p.type === 'select' ? p.type : 'text';
        params.push({
          key,
          label: (typeof p.label === 'string' && p.label.trim()) || key,
          type,
          options: Array.isArray(p.options) ? p.options.map(String) : undefined,
          default: typeof p.default === 'string' ? p.default : undefined,
          arg: typeof p.arg === 'string' && p.arg.trim() ? p.arg.trim() : undefined,
          env: typeof p.env === 'string' && p.env.trim() ? p.env.trim() : undefined,
          placeholder: typeof p.placeholder === 'string' ? p.placeholder : undefined,
          description: typeof p.description === 'string' ? p.description : undefined,
        });
      }
    }
    const profiles: LaunchProfile[] = [];
    if (Array.isArray(s.profiles)) {
      for (const item of s.profiles) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        if (typeof p.name !== 'string' || !p.name.trim() || !p.values || typeof p.values !== 'object') continue;
        const values: Record<string, string> = {};
        for (const [k, val] of Object.entries(p.values as Record<string, unknown>)) values[k] = String(val);
        profiles.push({ name: p.name.trim(), values });
      }
    }
    return params.length ? { params, profiles: profiles.length ? profiles : undefined } : undefined;
  };

  const cfg: ServiceGroupConfig = {
    id,
    name: String(r.name).trim(),
    desc: typeof r.desc === 'string' && r.desc.trim() ? r.desc.trim() : undefined,
    cwd: typeof r.cwd === 'string' && r.cwd.trim() ? r.cwd.trim() : serviceGroupDir(id),
    main: step(r.main),
    stop: step(r.stop),
    killPort: Number.isInteger(r.killPort) ? (r.killPort as number) : undefined,
    stopMode: stopMode(r.stopMode),
    health: h(r.health),
    shared: typeof r.shared === 'string' && r.shared.trim() ? r.shared.trim() : undefined,
    space: space(r.space),
    clients: Array.isArray(r.clients) ? r.clients.map(String) : [],
    launch: launch(r.launch),
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

/**
 * 读改写一气呵成（不跨 await）。
 *
 * 「先 loadRuntime()、算个新值、再 patchRuntime()」这种写法，两步之间只要有 await
 * （watcher 的检测、HTTP 请求都在这条路上），就会读到旧值把别人的更新覆盖掉——
 * 典型的丢更新。Node 单线程内同步块是原子的，所以把计算塞进 updater 里就干净了。
 *
 * 边界：只治**同进程**并发（watcher tick 与面板按钮同时动同一组）。
 * 两个 serve 进程同时改同一份 runtime.json 不在保证范围内。
 */
export function updateRuntime(id: string, updater: (cur: GroupRuntime) => Partial<GroupRuntime>): GroupRuntime {
  const all = loadRuntimeAll();
  const cur = { ...defaultRuntime(), ...all[id] };
  const next = { ...cur, ...updater(cur) };
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
