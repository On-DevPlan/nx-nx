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

// 启动脚本（启动版本）：同一个服务可以按不同端口 / 配置文件 / 环境启动。
// 每一条就是一套完整的启动方式：脚本（默认沿用 main.script）、参数、环境变量、端口。
// 不声明「参数表单」，启动前只在列表里选一个版本。
export interface LaunchEntry {
  /** 版本名，也是 CLI --entry 的值；组内唯一 */
  name: string;
  /** 这一版用哪个脚本；留空沿用 main.script（可指向组内另一个启动包装脚本） */
  script?: string;
  /** 完整参数（不继承 main.args）；start 时原样追加到脚本后面 */
  args: string[];
  /** 注入的环境变量 */
  env: Record<string, string>;
  /** 服务监听端口；留空则从 args 的 --port 推断。探活与 stop 都跟着它走 */
  port?: number;
  /** 一句话说明（面板上显示） */
  desc?: string;
}

export interface LaunchConfig {
  entries: LaunchEntry[];
}

export interface ServiceGroupConfig {
  id: string;
  name: string;
  /** 一段人话说明：这个服务是干什么的（首页展示 desc 用） */
  desc?: string;
  /** 这个服务自己的工作目录；启动进程的 cwd，也是 client 产物/临时文件的落点 */
  cwd?: string;
  main?: StepConfig; // 主脚本（长驻服务）
  stop?: StepConfig; // 服务自己的优雅关停脚本
  probe?: StepConfig; // 服务自己的探活脚本：退出码 0=活，非 0=失活
  killPort?: number; // stop 兜底：杀掉占用该端口的进程
  stopMode: StopMode; // 关闭动作的走法，默认 auto
  health?: HealthConfig;
  shared?: string; // 共享函数面板脚本名（如 demo.shared），组内脚本执行时自动装载
  space?: SpaceConfig; // 管理空间：面板 + 启动前的 bool check 方法
  clients: string[]; // client 脚本名列表（流水线的次步骤，依次执行）
  launch?: LaunchConfig; // 启动脚本列表（每个版本一套 script / args / env / port）
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
  /** 上一次实际使用的启动脚本（版本名）；自愈重启沿用这一条 */
  entry?: string;
  /** 上一次实际使用的监听端口；停止时优先按这个端口关 */
  port?: number;
}

export function defaultRuntime(): GroupRuntime {
  return { status: 'stopped', failStreak: 0, restarts: 0 };
}

// 组内脚本的摘要（面板展示用；list 不带，避免逐组扫盘）。
export interface GroupScriptSummary {
  name: string;
  path: string;
  kind: 'long' | 'short' | 'shared';
  shared: boolean;
  source: 'group' | 'external';
  size: number;
  updatedAt: number;
}

/**
 * 服务组的对外视图：配置 + 运行态 + （可选）组内脚本清单。
 *
 * 放在 core 而不是模块目录里：后端的文案渲染与前端的页面都消费它，
 * 两边共用同一个真相源——之前模块目录里另有一份 types.ts 重复定义，
 * 迟早与 store.ts 的形状漂移。
 */
export interface GroupView {
  config: ServiceGroupConfig;
  runtime: GroupRuntime;
  /** show 时附带：该组命名空间里的脚本；list 不带（避免逐组扫描磁盘）。 */
  scripts?: GroupScriptSummary[];
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

  const launch = (v: unknown, main: StepConfig | undefined): LaunchConfig | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const s = v as Record<string, unknown>;

    const uniqueName = (raw: string, used: Set<string>): string => {
      let name = raw.trim() || '启动版本';
      let i = 2;
      while (used.has(name)) name = `${raw.trim() || '启动版本'} (${i++})`;
      used.add(name);
      return name;
    };

    // 新格式：entries 每条就是一套完整启动脚本，原样用。
    if (Array.isArray(s.entries)) {
      const used = new Set<string>();
      const entries: LaunchEntry[] = [];
      for (const item of s.entries) {
        if (!item || typeof item !== 'object') continue;
        const e = item as Record<string, unknown>;
        if (typeof e.name !== 'string' || !e.name.trim()) continue;
        const env: Record<string, string> = {};
        if (e.env && typeof e.env === 'object' && !Array.isArray(e.env)) {
          for (const [k, val] of Object.entries(e.env as Record<string, unknown>)) {
            if (k.trim()) env[k.trim()] = String(val);
          }
        }
        const port = Number(e.port);
        entries.push({
          name: uniqueName(e.name, used),
          script: typeof e.script === 'string' && e.script.trim() ? e.script.trim() : undefined,
          args: Array.isArray(e.args) ? e.args.map(String) : [],
          env,
          port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined,
          desc: typeof e.desc === 'string' && e.desc.trim() ? e.desc.trim() : undefined,
        });
      }
      if (entries.length) return { entries };
    }

    // 旧格式兼容：params + profiles 在加载时折算成 entries，之后运行时只认 entries。
    // 这样旧配置仍能按原来的预设启动，但面板不再出现「参数编辑」这一栏。
    const params: { key: string; arg?: string; env?: string; default?: string; options?: string[] }[] = [];
    if (Array.isArray(s.params)) {
      for (const item of s.params) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        const key = typeof p.key === 'string' ? p.key.trim() : '';
        if (!key) continue;
        params.push({
          key,
          arg: typeof p.arg === 'string' && p.arg.trim() ? p.arg.trim() : undefined,
          env: typeof p.env === 'string' && p.env.trim() ? p.env.trim() : undefined,
          default: typeof p.default === 'string' ? p.default : undefined,
          options: Array.isArray(p.options) ? p.options.map(String) : undefined,
        });
      }
    }
    if (!params.length) return undefined;

    const defaults: Record<string, string> = {};
    for (const p of params) defaults[p.key] = p.default ?? p.options?.[0] ?? '';

    const rawProfiles: { name: string; values: Record<string, string> }[] = [];
    if (Array.isArray(s.profiles)) {
      for (const item of s.profiles) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        if (typeof p.name !== 'string' || !p.name.trim() || !p.values || typeof p.values !== 'object') continue;
        const values: Record<string, string> = {};
        for (const [k, val] of Object.entries(p.values as Record<string, unknown>)) values[k] = String(val);
        rawProfiles.push({ name: p.name.trim(), values });
      }
    }

    const toEntry = (name: string, values: Record<string, string>): LaunchEntry => {
      const args = [...(main?.args ?? [])];
      const env: Record<string, string> = {};
      let port: number | undefined;
      for (const p of params) {
        const val = values[p.key] ?? defaults[p.key] ?? '';
        if (!val) continue;
        if (p.arg) {
          const flag = `--${p.arg}`;
          for (let i = args.length - 1; i >= 0; i--) {
            if (args[i] === flag) args.splice(i, 2);
            else if (args[i]?.startsWith(flag + '=')) args.splice(i, 1);
          }
          args.push(flag, val);
        }
        if (p.env) env[p.env] = val;
        if (p.key === 'port' || p.arg === 'port') {
          const n = Number(val);
          if (Number.isInteger(n) && n > 0 && n <= 65535) port = n;
        }
      }
      return { name, script: main?.script, args, env, port };
    };

    const used = new Set<string>();
    const entries: LaunchEntry[] = [];
    if (rawProfiles.length) {
      for (const p of rawProfiles) entries.push(toEntry(uniqueName(p.name, used), { ...defaults, ...p.values }));
    } else {
      entries.push(toEntry('默认', defaults));
    }
    return { entries };
  };

  const main = step(r.main);
  const cfg: ServiceGroupConfig = {
    id,
    name: String(r.name).trim(),
    desc: typeof r.desc === 'string' && r.desc.trim() ? r.desc.trim() : undefined,
    cwd: typeof r.cwd === 'string' && r.cwd.trim() ? r.cwd.trim() : serviceGroupDir(id),
    main,
    stop: step(r.stop),
    probe: step(r.probe),
    killPort: Number.isInteger(r.killPort) ? (r.killPort as number) : undefined,
    stopMode: stopMode(r.stopMode),
    health: h(r.health),
    shared: typeof r.shared === 'string' && r.shared.trim() ? r.shared.trim() : undefined,
    space: space(r.space),
    clients: Array.isArray(r.clients) ? r.clients.map(String) : [],
    launch: launch(r.launch, main),
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
