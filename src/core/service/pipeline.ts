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
import { effectiveHealth, launchEnv, launchPort, type LaunchValues } from './launch.js';
import { serviceGroupDir, serviceHttpLogsDir } from './paths.js';
import { resolveServicePanel, resolveServiceScript } from './scripts.js';
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

const ALIVE_POLL_MS = 500;

export async function runPipeline(groupId: string, values?: LaunchValues): Promise<PipelineReport> {
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
      const r = await startGroup(groupId, { skipGate: true, values });
      steps.push({ step: 'main.start', script: g.main.script, ok: true, detail: r.detail });
    } catch (err) {
      steps.push({ step: 'main.start', script: g.main.script, ok: false, detail: msg(err) });
      return { groupId, ok: false, steps };
    }
  }

  // 2) 等活性就绪（上限按组配置：java -jar / go build 冷启动常常超过 20s）
  //    端口若由启动参数覆盖，探活也要跟着走同一个端口。
  //    启动后 runtime 里已写入本次参数；显式 values 优先。
  const launchValues = values ?? loadRuntime(groupId).launch;
  const health = effectiveHealth(g, launchValues);
  const servicePort = launchPort(g, launchValues) ?? health?.port;
  const serviceUrl = servicePort ? `http://${health?.host ?? '127.0.0.1'}:${servicePort}` : '';
  if (health) {
    const deadline = Date.now() + health.readyTimeoutMs;
    let alive = false;
    let detail = '';
    while (Date.now() < deadline) {
      const c = await checkHealth(health);
      detail = c.detail;
      if (c.alive) {
        alive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, ALIVE_POLL_MS));
    }
    steps.push({ step: 'main.alive', script: g.main?.script ?? '', ok: alive, detail });
    if (!alive) {
      await stopGroup(groupId, { silent: true });
      return { groupId, ok: false, steps };
    }
    // 挂上 watcher：流水线启动后进入持续监控
    startWatcher(groupId);
  }

  // 3) client 脚本依次执行（脚本路径来自组命名空间，共享面板也是组内那份）
  let sharedPanel: string | undefined;
  if (g.shared) {
    try {
      sharedPanel = resolveServicePanel(g.id, g.shared).path;
    } catch {
      // 面板缺失不阻断整条流水线：client 自己会因为缺 BASE_URL 等报错，
      // 那一步的错误会连同 stdout/stderr 一起进报告，定位更直接。
      sharedPanel = undefined;
    }
  }
  for (const client of g.clients) {
    const started = Date.now();
    try {
      const clientPath = resolveServiceScript(g.id, client).path;
      const r = await runScript(clientPath, {
        shared: sharedPanel,
        // client 在服务自己的 cwd 里跑：构建产物、请求样本、测试数据都落在服务目录，
        // 不再散落在 serve 进程的当前目录。
        cwd: g.cwd || serviceGroupDir(g.id),
        env: {
          ...(process.env.NX_NX_SERVE_PORT ? { NX_NX_SERVE_PORT: process.env.NX_NX_SERVE_PORT } : {}),
          NX_HTTP_LOG_DIR: serviceHttpLogsDir(g.id),
          NX_SERVICE_DIR: g.cwd || serviceGroupDir(g.id),
          ...launchEnv(g, launchValues),
          ...(servicePort ? { NX_SERVICE_PORT: String(servicePort), NX_SERVICE_URL: serviceUrl } : {}),
        },
      });
      steps.push({
        step: 'client',
        script: client,
        ok: r.code === 0,
        detail: reportText(r.stdout + (r.stderr ? '\n[stderr] ' + r.stderr : '')),
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

// 报告里的脚本输出：client 常常先打印 shared 面板装载快照、最后才是断言结果。
// 报告只留「真正跑测试」那一段：优先从 `── client 开始` / heading 之后开始，
// 没这个标记就退到 shared 隐藏用例之后；完整输出仍然原样进 client 执行日志。
function reportText(text: string): string {
  let t = text.trim();
  const heading = t.lastIndexOf('── client 开始');
  if (heading > 0) {
    t = t.slice(heading);
  } else {
    const sharedEnd = t.lastIndexOf('[shared] 隐藏用例');
    if (sharedEnd >= 0) {
      const nl = t.indexOf('\n', sharedEnd);
      if (nl >= 0) t = t.slice(nl + 1).trim();
    }
  }
  return t.length > 2000 ? '…（前略）\n' + t.slice(-2000) : t;
}

// 供 CLI/HTTP 直接使用 runtime 快照展示
export function runtimeText(id: string): string {
  const rt = loadRuntime(id);
  return rt.status + (rt.alive === undefined ? '' : rt.alive ? ' · 活性 OK' : ' · 活性 FAIL');
}
