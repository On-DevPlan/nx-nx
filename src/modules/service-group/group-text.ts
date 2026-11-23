// 服务组列表 / 详情的文本输出（从 index.ts 拆出，避免单文件超行数上限）。
import { serviceScriptsDir } from '../../core/service/paths.js';
import { resolveLaunch } from '../../core/service/launch.js';
import type { GroupView } from '../../core/service/store.js';

const CONFIG_HINT = `--config '{
  "main": { "script": "my-server", "args": ["--port", "18080"] },
  "health": { "kind": "http", "port": 18080, "path": "/health", "onDead": "restart" },
  "clients": ["my-client"]
}'`;

export function formatGroupList(groups: GroupView[]): string {
  if (!groups.length) {
    // 空态是唯一该甩完整示例的地方：用户此刻正需要知道怎么写配置。
    // 先给「一条命令就能跑」的模板路径，再给手写 JSON 的进阶路径。
    return [
      '（暂无服务组）最快的是用模板创建一个能跑的例子：',
      '  nx-nx sg init ping-demo     # 默认模板 node-ping：生成脚本 + 配置 + 下一步',
      '  nx-nx sg templates          # 看全部模板',
      '',
      '或用自己的脚本手写配置：',
      `  nx-nx sg set demo-group ${CONFIG_HINT}`,
    ].join('\n');
  }
  const lines = ['服务组:'];
  for (const g of groups) {
    const rt = g.runtime;
    const aliveMark =
      rt.status === 'running'
        ? rt.alive === false
          ? '· 活性 FAIL'
          : rt.alive === true
            ? '· 活性 OK'
            : '· 未检测'
        : '';
    lines.push(
      `  ${g.config.id}  ${g.config.name}  [${rt.status}]${aliveMark}` +
        (rt.entry ? ` 版本 ${rt.entry}${rt.port ? `:${rt.port}` : ''}` : '') +
        (rt.restarts ? ` 自愈${rt.restarts}次` : '') +
        (g.config.health?.onDead === 'none' ? ' · 自愈OFF' : ''),
    );
  }
  lines.push('', '详情: nx-nx sg show <id> · 流水线: nx-nx sg run <id>');
  return lines.join('\n');
}

export function formatGroupShow(r: GroupView): string {
  const c = r.config;
  const rt = r.runtime;
  let launch: ReturnType<typeof resolveLaunch> | undefined;
  try {
    launch = resolveLaunch(c, rt.entry);
  } catch {
    // 配置不完整 / 启动脚本被删：show 仍要能看，退回静态 health。
  }
  const healthPort = rt.port ?? launch?.health?.port ?? c.health?.port;
  const lines = [
    `服务组 ${c.id} · ${c.name}`,
    `  状态: ${rt.status}${rt.pid ? ` (pid ${rt.pid})` : ''}${rt.entry ? ` · 版本 ${rt.entry}` : ''}${rt.port ? ` · 端口 ${rt.port}` : ''}${rt.alive === undefined ? '' : rt.alive ? ' · 活性 OK' : ' · 活性 FAIL'}`,
    `  main: ${c.main ? c.main.script + ' ' + c.main.args.join(' ') : '(未配置)'}`,
    `  启动脚本: ${
      c.launch?.entries.length
        ? c.launch.entries
            .map((e) => `${e.name}${e.port ? `(:${e.port})` : ''}${e.script ? ` [${e.script}]` : ''}`)
            .join(' · ')
        : '(未配置，按 main 默认参数启动)'
    }`,
    `  stop: ${c.stop ? c.stop.script : '(无关停脚本)'}${c.killPort ? ` · 兜底端口 ${c.killPort}` : ''} · mode=${c.stopMode}`,
    `  health: ${c.health ? `${c.health.kind} ${c.health.host}:${healthPort}${c.health.path} · 每 ${c.health.intervalMs}ms · 阈值 ${c.health.failThreshold} · 就绪上限 ${c.health.readyTimeoutMs}ms` : '(未配置)'}`,
    `  自愈: ${c.health ? (c.health.onDead === 'restart' ? '开启（失活即重启）' : '关闭（只记录）') : '(无检测，不可用)'}`,
    `  shared: ${c.shared ?? '(无)'}`,
    `  clients: ${c.clients.length ? c.clients.join(', ') : '(无)'}`,
    `  脚本命名空间: ${serviceScriptsDir(c.id)}${r.scripts ? `（${r.scripts.length} 个）` : ''}`,
    `  自愈次数: ${rt.restarts} · 连续失败: ${rt.failStreak}`,
    rt.detail ? `  最近检测: ${rt.detail}` : '',
    rt.lastEvent ? `  最近事件: ${rt.lastEvent}` : '',
    rt.logFile ? `  日志: ${rt.logFile}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
