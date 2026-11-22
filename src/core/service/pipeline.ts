// 服务组流水线 = 一组 client 脚本按顺序执行。
//
// 明确边界：流水线不负责长服务的启动、探活、自愈与停止。
// 生命周期是服务自己的事（sg start / check / stop / watcher）；
// 这条流水线只把已准备好的服务当依赖，按配置顺序跑业务请求。
import { runScript } from '../script/service.js';
import { resolveLaunch, type ResolvedLaunch } from './launch.js';
import { serviceGroupDir, serviceHttpLogsDir } from './paths.js';
import { resolveServicePanel, resolveServiceScript } from './scripts.js';
import { appendClientRecord } from './logs.js';
import { getGroup, loadRuntime, patchRuntime } from './store.js';

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

export async function runPipeline(groupId: string): Promise<PipelineReport> {
  const g = getGroup(groupId);
  const steps: PipelineStepReport[] = [];
  let ok = true;

  if (!g.clients.length) {
    steps.push({ step: 'noop', script: '', ok: false, detail: '这个服务还没有 client 脚本' });
    patchRuntime(groupId, { lastEvent: '客户端流水线为空' });
    return { groupId, ok: false, steps };
  }

  // 环境变量跟着「当前实际启动版本」走；服务没起时也用列表第一条给出可请求的 URL。
  let launch: ResolvedLaunch = { script: '', args: [], env: {}, port: undefined, health: g.health };
  try {
    launch = resolveLaunch(g, loadRuntime(groupId).entry);
  } catch {
    try {
      launch = resolveLaunch(g);
    } catch {
      // 启动脚本配置坏了不影响 client 流水线继续执行
    }
  }
  const servicePort = launch.port ?? g.health?.port ?? g.killPort;
  const serviceUrl = servicePort ? `http://${launch.health?.host ?? g.health?.host ?? '127.0.0.1'}:${servicePort}` : '';
  const cwd = g.cwd || serviceGroupDir(g.id);

  let sharedPanel: string | undefined;
  if (g.shared) {
    try {
      sharedPanel = resolveServicePanel(g.id, g.shared).path;
    } catch {
      sharedPanel = undefined;
    }
  }

  for (const client of g.clients) {
    const started = Date.now();
    try {
      const clientPath = resolveServiceScript(g.id, client).path;
      const r = await runScript(clientPath, {
        shared: sharedPanel,
        cwd,
        env: {
          ...(process.env.NX_NX_SERVE_PORT ? { NX_NX_SERVE_PORT: process.env.NX_NX_SERVE_PORT } : {}),
          NX_HTTP_LOG_DIR: serviceHttpLogsDir(g.id),
          NX_SERVICE_DIR: cwd,
          ...launch.env,
          ...(servicePort ? { NX_SERVICE_PORT: String(servicePort), NX_SERVICE_URL: serviceUrl } : {}),
        },
      });
      const passed = r.code === 0;
      steps.push({
        step: 'client',
        script: client,
        ok: passed,
        detail: reportText(r.stdout + (r.stderr ? '\n[stderr] ' + r.stderr : '')),
      });
      appendClientRecord(g.id, {
        script: client,
        code: r.code,
        ms: Date.now() - started,
        stdout: r.stdout,
        stderr: r.stderr,
      });
      if (!passed) ok = false;
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

  patchRuntime(groupId, { lastEvent: ok ? '客户端流水线执行完成' : '客户端流水线有失败步骤' });
  return { groupId, ok, steps };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 报告只留「真正跑测试」那一段：shared 面板每次装载都会打变量堆，
// 那是调试信息，不该淹没 client 自己的结论。完整输出仍进 client 执行日志。
function reportText(text: string): string {
  let t = text.trim();
  const heading = t.lastIndexOf('── client 开始');
  if (heading >= 0) t = t.slice(heading);
  return t.length > 2000 ? '…（前略）\n' + t.slice(-2000) : t;
}
