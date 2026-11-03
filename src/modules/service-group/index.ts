// 服务组域：主/次脚本编排 + 活性检测 + 自愈 + 共享函数面板 + 执行流水线。
//
// 概念（与脚本域的关系）：
//   服务组 = 1 个主脚本（长驻服务，IO 重定向到日志）+ N 个 client 脚本（依次执行的请求方）
//   活性检测 = 端口可连 / HTTP 可响应；连续失败达阈值 → 自愈重启（serve 进程内的 watcher）
//   共享函数面板 = <group>.shared.mjs：常量 = 函数 = {}，组内脚本执行前自动装载并输出堆快照
//
// 所有操作同时是 CLI 命令与 HTTP 路由；Web「服务」页的每个按钮都有等价命令。
import { defineAction } from '../../runtime/types/action.js';
import { defineModule } from '../../runtime/types/module.js';
import * as service from './service.js';

const CONFIG_HINT = `--json '{
  "name": "示例服务",
  "main": { "script": "demo-server", "args": ["--port", "8080"] },
  "stop": { "script": "demo-stop" },
  "killPort": 8080,
  "health": { "kind": "http", "port": 8080, "host": "127.0.0.1", "path": "/health",
              "intervalMs": 5000, "failThreshold": 3, "onDead": "restart" },
  "shared": "demo.shared",
  "clients": ["demo-client"]
}'`;

export default defineModule({
  id: 'service-group',
  title: '服务',
  order: 35,
  actions: [
    defineAction({
      id: 'serviceGroup.list',
      cli: ['sg', 'list'],
      http: ['GET', '/api/service-groups'],
      summary: '列出服务组（配置 + 运行态）',
    })(
      () => ({ groups: service.listGroups() }),
      (r) => {
        if (!r.groups.length) {
          return '（暂无服务组）nx-nx sg set <id> --json \'{ "name": "…", "main": { "script": "…" } }\' 创建';
        }
        const lines = ['服务组:'];
        for (const g of r.groups) {
          const rt = g.runtime;
          const aliveMark =
            rt.status === 'running' ? (rt.alive === false ? '· 活性 FAIL' : rt.alive === true ? '· 活性 OK' : '· 未检测') : '';
          lines.push(
            `  ${g.config.id}  ${g.config.name}  [${rt.status}]${aliveMark}` +
              (rt.restarts ? ` 自愈${rt.restarts}次` : ''),
          );
        }
        lines.push('', '详情: nx-nx sg show <id> · 流水线: nx-nx sg run <id>');
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.show',
      cli: ['sg', 'show'],
      http: ['GET', '/api/service-groups/:id'],
      summary: '查看服务组配置与运行态详情',
      args: ['id'],
    })(
      (ctx) => service.showGroup(ctx.id),
      (r) => {
        const c = r.config;
        const rt = r.runtime;
        const lines = [
          `服务组 ${c.id} · ${c.name}`,
          `  状态: ${rt.status}${rt.pid ? ` (pid ${rt.pid})` : ''}${rt.alive === undefined ? '' : rt.alive ? ' · 活性 OK' : ' · 活性 FAIL'}`,
          `  main: ${c.main ? c.main.script + ' ' + c.main.args.join(' ') : '(未配置)'}`,
          `  stop: ${c.stop ? c.stop.script : '(无)'}${c.killPort ? ` · 杀端口 ${c.killPort}` : ''}`,
          `  health: ${c.health ? JSON.stringify(c.health) : '(未配置)'}`,
          `  shared: ${c.shared ?? '(无)'}`,
          `  clients: ${c.clients.length ? c.clients.join(', ') : '(无)'}`,
          `  自愈次数: ${rt.restarts} · 连续失败: ${rt.failStreak}`,
          rt.detail ? `  最近检测: ${rt.detail}` : '',
          rt.lastEvent ? `  最近事件: ${rt.lastEvent}` : '',
          rt.logFile ? `  日志: ${rt.logFile}` : '',
        ];
        return lines.filter(Boolean).join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.set',
      cli: ['sg', 'set'],
      http: ['PUT', '/api/service-groups/:id'],
      summary: '创建或整组更新服务组配置（JSON 传入）',
      args: ['id'],
      flags: {
        config: { type: "string", required: true, hint: "服务组配置 JSON（name/main/stop/killPort/health/shared/clients）" },
      },
    })(
      (ctx) => { console.error("DBG type=" + typeof ctx.config + " val=" + String(ctx.config).slice(0, 100)); return service.setGroup(ctx.id, ctx.config); },
      (r) => `已保存服务组 ${r.id}（${r.name}）\n  main: ${r.main?.script ?? '(未配置)'} · health: ${r.health ? r.health.kind + ':' + r.health.port : '无'} · clients: ${r.clients.join(', ') || '无'}\n  示例配置: ${CONFIG_HINT.slice(0, 0) || ''}`.trim(),
    ),

    defineAction({
      id: 'serviceGroup.delete',
      cli: ['sg', 'delete'],
      http: ['DELETE', '/api/service-groups/:id'],
      summary: '删除服务组（先停止运行中的服务）',
      args: ['id'],
    })(
      (ctx) => service.deleteGroup(ctx.id),
      (r) => `已删除服务组 ${r.id}（${r.stopped}）`,
    ),

    defineAction({
      id: 'serviceGroup.start',
      cli: ['sg', 'start'],
      http: ['POST', '/api/service-groups/:id/start'],
      summary: '启动主脚本（detached + 日志重定向；配置了 health 则进入持续监控）',
      args: ['id'],
    })(
      (ctx) => service.start(ctx.id),
      (r) => (r.started ? `已启动 (pid ${r.pid})\n  日志: ${r.logFile}` : `未重复启动：${r.detail}`),
    ),

    defineAction({
      id: 'serviceGroup.stop',
      cli: ['sg', 'stop'],
      http: ['POST', '/api/service-groups/:id/stop'],
      summary: '停止服务：关停脚本 → 杀端口 → 杀 pid（依次兜底）',
      args: ['id'],
    })(
      (ctx) => service.stop(ctx.id),
      (r) => `已停止：${r.detail}`,
    ),

    defineAction({
      id: 'serviceGroup.status',
      cli: ['sg', 'status'],
      http: ['GET', '/api/service-groups-runtime'],
      summary: '查看运行态快照（不带 id 看全部）',
      args: [{ name: 'id', required: false }],
    })(
      (ctx) => service.status(ctx.id),
      (r) => JSON.stringify(r, null, 2),
    ),

    defineAction({
      id: 'serviceGroup.check',
      cli: ['sg', 'check'],
      http: ['GET', '/api/service-groups/:id/alive'],
      summary: '立即执行一次活性检测（端口/HTTP），返回 { alive, detail }',
      args: ['id'],
    })(
      (ctx) => service.check(ctx.id),
      (r) => `${r.alive ? '✔ 活' : '✘ 失活'}  ${r.detail}`,
    ),

    defineAction({
      id: 'serviceGroup.run',
      cli: ['sg', 'run'],
      http: ['POST', '/api/service-groups/:id/run'],
      summary: '执行流水线：启动 main → 等活性就绪 → clients 依次执行',
      args: ['id'],
    })(
      (ctx) => service.run(ctx.id),
      (r) => {
        const lines = [`${r.ok ? '✔' : '✘'} 流水线 ${r.groupId}:`];
        for (const s of r.steps) {
          lines.push(`  ${s.ok ? '✔' : '✘'} ${s.step.padEnd(12)} ${s.script}`);
          if (s.detail) {
            for (const l of s.detail.split('\n').slice(0, 12)) lines.push(`      ${l}`);
          }
        }
        return lines.join('\n');
      },
    ),
  ],
});
