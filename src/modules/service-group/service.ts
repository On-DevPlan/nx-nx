// 服务组域的业务 facade：组 CRUD、启停、活性、流水线。
//
// core/service/ 是执行真相源；这里做参数校验与结果整形，供 CLI/HTTP/Web 共用。
import {
  getGroup,
  loadGroups,
  loadRuntime,
  normalizeGroup,
  saveGroups,
  type ServiceGroupConfig,
} from '../../core/service/store.js';
import { assertGroupId } from '../../core/service/paths.js';
import {
  runtimeSnapshot,
  setAutoHeal,
  startGroup,
  startWatcher,
  stopGroup,
} from '../../core/service/runtime.js';
import type { StopResult } from '../../core/service/stop.js';
import { runPipeline } from '../../core/service/pipeline.js';
import { groupLogs } from '../../core/service/logs.js';
import {
  callSpaceMethod,
  introspectSpace,
  loadSpaceIndex,
  refreshSpaceIndex,
  resolvePanelPath,
  type SpaceActionResult,
  type SpaceIndexEntry,
} from '../../core/service/namespace.js';
import { remoteSpaceAction } from '../../core/service/space-remote.js';
import {
  applyTemplate as applyServiceTemplate,
  listTemplates as listServiceTemplates,
  type InitInput,
  type InitResult,
  type ServiceTemplateMeta,
} from '../../core/service/templates.js';

export interface ServiceGroupView {
  config: ServiceGroupConfig;
  runtime: {
    status: string;
    pid?: number;
    alive?: boolean;
    detail?: string;
    lastCheckAt?: number;
    failStreak: number;
    restarts: number;
    lastEvent?: string;
    logFile?: string;
    /** 上一次启动实际使用的参数（端口 / 环境 / 配置文件）。 */
    launch?: Record<string, string>;
  };
}

export function listGroups(): ServiceGroupView[] {
  return loadGroups().map((g) => {
    const rt = loadRuntime(g.id);
    return {
      config: g,
      runtime: {
        status: rt.status,
        pid: rt.pid,
        alive: rt.alive,
        detail: rt.detail,
        lastCheckAt: rt.lastCheckAt,
        failStreak: rt.failStreak,
        restarts: rt.restarts,
        lastEvent: rt.lastEvent,
        logFile: rt.logFile,
        launch: rt.launch,
      },
    };
  });
}

export function showGroup(id: unknown): ServiceGroupView {
  const g = getGroup(assertGroupId(id));
  const rt = loadRuntime(g.id);
  return {
    config: g,
    runtime: {
      status: rt.status,
      pid: rt.pid,
      alive: rt.alive,
      detail: rt.detail,
      lastCheckAt: rt.lastCheckAt,
      failStreak: rt.failStreak,
      restarts: rt.restarts,
      lastEvent: rt.lastEvent,
      logFile: rt.logFile,
      launch: rt.launch,
    },
  };
}

// 创建或整组更新（配置以 JSON 传入；id 为 slug）
export function setGroup(id: unknown, configJson: unknown): ServiceGroupConfig {
  const gid = assertGroupId(id);
  let raw: unknown;
  try {
    raw = JSON.parse(String(configJson ?? '{}'));
  } catch (err) {
    throw new Error(`--json 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const cfg = normalizeGroup(raw, gid);
  const groups = loadGroups().filter((g) => g.id !== gid);
  groups.push(cfg);
  saveGroups(groups);
  // 配置变了：监控按新配置重建（若该组正在运行）
  if (cfg.health) startWatcher(gid);
  return cfg;
}

export async function deleteGroup(id: unknown): Promise<{ id: string; stopped: string }> {
  const gid = assertGroupId(id);
  const existing = loadGroups().some((g) => g.id === gid);
  if (!existing) throw new Error(`服务组不存在: ${gid}`);
  const stopResult = await stopGroup(gid, { silent: true });
  saveGroups(loadGroups().filter((g) => g.id !== gid));
  return { id: gid, stopped: stopResult.detail };
}

export function start(
  id: unknown,
  values?: unknown,
): Promise<{ started: boolean; pid?: number; logFile: string; detail: string }> {
  const parsed = parseLaunchValues(values);
  return startGroup(assertGroupId(id), parsed ? { values: parsed } : {});
}

// 启动参数从 CLI/HTTP 传进来时是 JSON 字符串；必须是「字符串到字符串」的对象。
function parseLaunchValues(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error(`启动参数必须是 JSON 对象：${raw}`);
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('启动参数必须是 JSON 对象');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = String(v);
  return out;
}

export function stop(id: unknown, mode?: unknown): Promise<StopResult> {
  const m = typeof mode === 'string' && mode.trim() ? mode.trim() : undefined;
  return stopGroup(assertGroupId(id), { mode: m });
}

// 「是否启动自愈」——长脚本日常三动作之一（启动 / 关闭 / 自愈开关）
export function autoheal(id: unknown, state: unknown): { id: string; autoHeal: boolean; watching: boolean } {
  const s = String(state ?? '').trim().toLowerCase();
  if (s !== 'on' && s !== 'off') {
    throw new Error(`--state 只能是 on / off（收到 ${JSON.stringify(state)}）`);
  }
  return setAutoHeal(assertGroupId(id), s === 'on');
}

export function status(id?: unknown): unknown {
  return runtimeSnapshot(id === undefined || id === '' ? undefined : assertGroupId(id));
}

// 日志视图：事件日志 / 主脚本 IO 日志尾部 / HTTP 请求日志清单。
// 排查「它怎么就失活了」「请求发出去什么样」时，答案都在这里。
export function logs(id: unknown): ReturnType<typeof groupLogs> {
  const gid = assertGroupId(id);
  const rt = loadRuntime(gid);
  return groupLogs(gid, rt.logFile);
}

// 立即执行一次活性检测（设置检测后，这就是「函数面板 check 的服务端事实源」）
export async function check(id: unknown): Promise<{ id: string; alive: boolean; detail: string }> {
  const g = getGroup(assertGroupId(id));
  if (!g.health) throw new Error(`服务组 ${g.id} 未配置活性检测（health）`);
  const { checkHealth } = await import('../../core/service/check.js');
  const r = await checkHealth(g.health);
  return { id: g.id, alive: r.alive, detail: r.detail };
}

// 流水线：main 启动 → 等活性 → clients（测试脚本组）依次执行
export function run(id: unknown, values?: unknown): ReturnType<typeof runPipeline> {
  const parsed = parseLaunchValues(values);
  return runPipeline(assertGroupId(id), parsed);
}

// ---- 管理空间 ----
//
// 空间 = 共享面板被装载后的可管理实体。core 侧只做「索引 + 派发」：
// 真正的装载与调用在 _runner.mjs 子进程里发生，core 永远不执行用户代码。

// 某组绑定的空间：面板 + 启动前的 check 方法名
export function groupSpace(id: unknown): { panel: string; check: string } | null {
  const g = getGroup(assertGroupId(id));
  const panel = g.space?.panel || g.shared;
  if (!panel) return null;
  return { panel, check: g.space?.check ?? 'checkUp' };
}

// 空间清单：方法清单 + 状态堆
export async function spaceIntrospect(id: unknown): Promise<SpaceActionResult> {
  const s = groupSpace(id);
  if (!s) throw new Error(`服务组 ${assertGroupId(id)} 未绑定管理空间（shared / space.panel 都没配）`);
  const gid = assertGroupId(id);
  const panelPath = resolvePanelPath(s.panel);
  // serve 在跑时，命令作用在它那个常驻空间上（命令与界面是同一个实体）；
  // serve 不可达就退回本地会话。
  const r = (await remoteSpaceAction(gid, 'introspect')) ?? (await introspectSpace(panelPath));
  // 顺手刷新索引：空间清单落盘后，`sg spaces` 不用每次装载面板
  if (r.ok) {
    try {
      await refreshSpaceIndex(gid, panelPath, gid, r);
    } catch {
      // 索引写失败不该影响空间本身的读取
    }
  }
  return r;
}

// 本机所有空间（从索引读）：每个空间有哪些方法
export function listSpaces(): SpaceIndexEntry[] {
  return loadSpaceIndex().spaces;
}

// 调用空间的一个方法
export async function spaceCall(
  id: unknown,
  method: unknown,
  args: unknown[] = [],
): Promise<SpaceActionResult> {
  const s = groupSpace(id);
  if (!s) throw new Error(`服务组 ${assertGroupId(id)} 未绑定管理空间（shared / space.panel 都没配）`);
  const gid = assertGroupId(id);
  const name = String(method ?? '');
  const remote = await remoteSpaceAction(gid, 'call', { method: name, args });
  if (remote) return remote;
  return callSpaceMethod(resolvePanelPath(s.panel), name, args);
}

// 空间的堆快照（只含可 JSON 表示的数据确认）
export async function spaceSnapshot(id: unknown): Promise<SpaceActionResult> {
  return spaceIntrospect(id);
}

// ---- hub 概览 ----
//
// 「一组 = 一个 hub」的日常视图：一个命令看清整组——
//   server 是什么、有没有活；client 有哪些、按什么顺序跑；空间能干什么。
export interface HubOverview {
  id: string;
  name: string;
  server: { script: string; args: string[]; status: string; pid?: number; alive?: boolean; detail?: string } | null;
  clients: string[];
  stop: string;
  health: string;
  space: { panel: string; check: string; methods: string[] } | null;
  nextCommand: string;
}

export async function hubOverview(id: unknown): Promise<HubOverview> {
  const gid = assertGroupId(id);
  const g = getGroup(gid);
  const rt = loadRuntime(gid);
  const s = groupSpace(gid);
  let methods: string[] = [];
  if (s) {
    const r = await introspectSpace(resolvePanelPath(s.panel));
    if (r.ok) methods = (r.methods ?? []).map((m) => m.name);
  }
  return {
    id: g.id,
    name: g.name,
    server: g.main
      ? {
          script: g.main.script,
          args: g.main.args,
          status: rt.status,
          pid: rt.pid,
          alive: rt.alive,
          detail: rt.detail,
        }
      : null,
    clients: g.clients,
    stop: g.stop ? `${g.stop.script} · mode=${g.stopMode}` : `mode=${g.stopMode}${g.killPort ? ` · 杀端口 ${g.killPort}` : ''}`,
    health: g.health ? `${g.health.kind} ${g.health.host}:${g.health.port}` : '（无）',
    space: s ? { panel: s.panel, check: s.check, methods } : null,
    nextCommand: `nx-nx sg run ${g.id}`,
  };
}

// ---- 模板（上手引导的唯一入口）----
//
// 模板 = 脚本正文（assets/service-templates/*.tpl）+ 已归一化的组配置。
// 一条 sg init 把两者都落盘，并给出下一步命令——「引导性不够」的解法就是它。

export function templates(): ServiceTemplateMeta[] {
  return listServiceTemplates();
}

export function initFromTemplate(input: InitInput): InitResult {
  return applyServiceTemplate(input);
}
