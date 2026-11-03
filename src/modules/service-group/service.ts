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
  startGroup,
  startWatcher,
  stopGroup,
} from '../../core/service/runtime.js';
import { runPipeline } from '../../core/service/pipeline.js';

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

export function deleteGroup(id: unknown): { id: string; stopped: string } {
  const gid = assertGroupId(id);
  const existing = loadGroups().some((g) => g.id === gid);
  if (!existing) throw new Error(`服务组不存在: ${gid}`);
  const stopResult = stopGroup(gid, { silent: true });
  saveGroups(loadGroups().filter((g) => g.id !== gid));
  return { id: gid, stopped: stopResult.detail };
}

export function start(id: unknown): Promise<{ started: boolean; pid?: number; logFile: string; detail: string }> {
  return startGroup(assertGroupId(id));
}

export function stop(id: unknown): { stopped: boolean; detail: string } {
  return stopGroup(assertGroupId(id));
}

export function status(id?: unknown): unknown {
  return runtimeSnapshot(id === undefined || id === '' ? undefined : assertGroupId(id));
}

// 立即执行一次活性检测（设置检测后，这就是「函数面板 check 的服务端事实源」）
export async function check(id: unknown): Promise<{ id: string; alive: boolean; detail: string }> {
  const g = getGroup(assertGroupId(id));
  if (!g.health) throw new Error(`服务组 ${g.id} 未配置活性检测（health）`);
  const { checkHealth } = await import('../../core/service/check.js');
  const r = await checkHealth(g.health);
  return { id: g.id, alive: r.alive, detail: r.detail };
}

// 流水线：main 启动 → 等活性 → clients 依次执行
export function run(id: unknown): ReturnType<typeof runPipeline> {
  return runPipeline(assertGroupId(id));
}
