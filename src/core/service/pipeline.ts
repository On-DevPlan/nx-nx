// 服务组执行流水线：主脚本启动 → 等活性就绪 → client 脚本依次执行。
//
// 「依次启动」的语义：main 先行，health 配了就轮询活性直到就绪或超时，
// 然后 clients 按数组顺序逐个同步执行（collect stdout/stderr 进报告）。
//
// 空间 check 的位置很讲究：**在启动 server 之前**。
// 空间里那个返回 bool 的方法（如 checkUp）回答的是「现在该不该起这个服务」——
// 依赖没就绪就别起，起早了只会白占端口再被杀掉。check 不过直接短路，不启动。
import { runScript } from '../script/service.js';
import { checkHealth } from './check.js';
import { serviceHttpLogsDir } from './paths.js';
import { appendClientRecord } from './logs.js';
import {
  getGroup,
  loadRuntime,
  patchRuntime,
  type ServiceGroupConfig,
} from './store.js';
import { spaceGate, startGroup, startWatcher, stopGroup } from './runtime.js';

export interface PipelineStepReport {
  step: string;
  script: string;
  ok: boolean;
  detail: string;
}

export interface PipelineReport {
  groupId: string;
  ok: boolean;
  steps: PipelineStepReport[];
}

const ALIVE_TIMEOUT_MS = 20000;
const ALIVE_POLL_MS = 500;

export async function runPipeline(groupId: string): Promise<PipelineReport> {
  const g: ServiceGroupConfig = getGroup(groupId);
  const steps: PipelineStepReport[] = [];
  let ok = true;

  // 0) 执行 server 前先 check：问空间一句「现在能起吗」
  //    闸门与 sg start 用的是同一个 spaceGate（runtime.ts）——两扇门同一把锁。
  const gate = await spaceGate(g);
  if (gate) {
    steps.push({ step: 'space.check', script: gate.method, ok: gate.alive, detail: gate.detail });
    if (!gate.alive) {
      patchRuntime(groupId, { lastEvent: '空间 check 未通过，未启动主脚本' });
      return { groupId, ok: false, steps };
    }
  }

  // 1) 主脚本（skipGate：上面已经问过闸门了，不重复起子进程）
  if (g.main) {
    try {
      const r = await startGroup(groupId, { skipGate: true });
      steps.push({ step: 'main.start', script: g.main.script, ok: true, detail: r.detail });
    } catch (err) {
      steps.push({ step: 'main.start', script: g.main.script, ok: false, detail: msg(err) });
      return { groupId, ok: false, steps };
    }
  }

  // 2) 等活性就绪
  if (g.health) {
    const deadline = Date.now() + ALIVE_TIMEOUT_MS;
    let alive = false;
    let detail = '';
    while (Date.now() < deadline) {
      const c = await checkHealth(g.health);
      detail = c.detail;
      if (c.alive) {
        alive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, ALIVE_POLL_MS));
    }
    steps.push({ step: 'main.alive', script: g.main?.script ?? '', ok: alive, detail });
    if (!alive) {
      stopGroup(groupId, { silent: true });
      return { groupId, ok: false, steps };
    }
    // 挂上 watcher：流水线启动后进入持续监控
    startWatcher(groupId);
  }

  // 3) client 脚本依次执行
  for (const client of g.clients) {
    const started = Date.now();
    try {
      const r = await runScript(client, {
        shared: g.shared,
        env: {
          ...(process.env.NX_NX_SERVE_PORT ? { NX_NX_SERVE_PORT: process.env.NX_NX_SERVE_PORT } : {}),
          NX_HTTP_LOG_DIR: serviceHttpLogsDir(g.id),
        },
      });
      steps.push({
        step: 'client',
        script: client,
        ok: r.code === 0,
        detail: (r.stdout + (r.stderr ? '\n[stderr] ' + r.stderr : '')).trim().slice(0, 2000),
      });
      appendClientRecord(g.id, {
        script: client,
        code: r.code,
        ms: Date.now() - started,
        stdout: r.stdout,
        stderr: r.stderr,
      });
      if (r.code !== 0) ok = false;
    } catch (err) {
      steps.push({ step: 'client', script: client, ok: false, detail: msg(err) });
      appendClientRecord(g.id, {
        script: client,
        code: 1,
        ms: Date.now() - started,
        stdout: '',
        stderr: msg(err),
      });
      ok = false;
    }
  }

  if (!g.main && g.clients.length === 0) {
    steps.push({ step: 'noop', script: '', ok: false, detail: '服务组未配置 main 与 clients' });
    ok = false;
  }

  patchRuntime(groupId, { lastEvent: ok ? '流水线执行完成' : '流水线执行有失败步骤' });
  return { groupId, ok, steps };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 供 CLI/HTTP 直接使用 runtime 快照展示
export function runtimeText(id: string): string {
  const rt = loadRuntime(id);
  return rt.status + (rt.alive === undefined ? '' : rt.alive ? ' · 活性 OK' : ' · 活性 FAIL');
}
