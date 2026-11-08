// 服务组域：主/次脚本编排 + 活性检测 + 自愈 + 管理空间 + 执行流水线。
//
// 概念（与脚本域的关系）：
//   服务组 = 1 个主脚本（长驻服务，IO 重定向到日志）+ N 个 client 脚本（依次执行的请求方）
//   活性检测 = 端口可连 / HTTP 可响应；连续失败达阈值 → 自愈重启（serve 进程内的 watcher）
//   管理空间 = 共享面板（<group>.shared.mjs）被装载后的可管理实体：
//               有名字、有状态（堆）、有方法（可列举 / 可调用）、有调用栈。
//               空间里的 bool 方法在执行 server 之前先 check——不通过就不启动。
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
  "space": { "panel": "demo.shared", "check": "checkUp" },
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
      (ctx) => service.setGroup(ctx.id, ctx.config),
      (r) => `已保存服务组 ${r.id}（${r.name}）\n  main: ${r.main?.script ?? '(未配置)'} · health: ${r.health ? r.health.kind + ':' + r.health.port : '无'} · clients: ${r.clients.join(', ') || '无'}\n  示例配置: ${CONFIG_HINT}`,
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
      id: 'serviceGroup.logs',
      cli: ['sg', 'logs'],
      http: ['GET', '/api/service-groups/:id/logs'],
      summary: '查看服务组日志：事件（启动/停止/检测失败/自愈）/ 主脚本 IO 尾部 / HTTP 请求日志清单',
      args: ['id'],
    })(
      (ctx) => service.logs(ctx.id),
      (r) => {
        const lines: string[] = [];
        if (r.events.trim()) lines.push('事件日志:', r.events.trimEnd());
        if (r.main.trim()) lines.push('主脚本日志（尾部）:', r.main.trimEnd());
        if (r.http.length) {
          lines.push(`HTTP 请求日志（${r.http.length} 条，最近在前）:`);
          for (const h of r.http.slice(0, 20)) lines.push(`  ${h.name}  ${h.size} 字节`);
        }
        if (!lines.length) lines.push('（该服务组还没有日志）');
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.spaces',
      cli: ['sg', 'spaces'],
      http: ['GET', '/api/service-spaces'],
      summary: '列出本机的管理空间（每个空间有哪些方法）',
    })(
      () => ({ spaces: service.listSpaces() }),
      (r) => {
        if (!r.spaces.length) {
          return '（还没有登记的空间——执行一次 sg space <组> 后会自动登记）';
        }
        const lines = ['管理空间:'];
        for (const s of r.spaces) {
          lines.push(`  ${s.id}  ${s.name}  ${s.methods.length} 个方法  ${s.panel}`);
          if (s.methods.length) {
            lines.push(`    ${s.methods.map((m) => m.name).join(', ')}`);
          }
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.hub',
      cli: ['sg', 'hub'],
      http: ['GET', '/api/service-groups/:id/hub'],
      summary: 'hub 概览：一组看清 server / client / 空间方法 / 当前状态',
      args: ['id'],
    })(
      (ctx) => service.hubOverview(ctx.id),
      (r) => {
        const lines = [`hub ${r.id} · ${r.name}`];
        if (r.server) {
          const s = r.server;
          const mark = s.status !== 'running' ? '·' : s.alive === false ? '✘' : '✔';
          lines.push(`  server  ${mark} ${s.script} ${s.args.join(' ')}`.trimEnd());
          lines.push(`          状态 ${s.status}${s.pid ? ` (pid ${s.pid})` : ''}${s.detail ? ` · ${s.detail}` : ''}`);
        } else {
          lines.push('  server  （未配置）');
        }
        lines.push(`  client  ${r.clients.length ? r.clients.join(' → ') : '（无）'}`);
        lines.push(`  stop    ${r.stop}`);
        lines.push(`  health  ${r.health}`);
        if (r.space) {
          lines.push(`  space   ${r.space.panel} · check=${r.space.check}`);
          lines.push(`          方法 ${r.space.methods.length ? r.space.methods.join(', ') : '（无）'}`);
        } else {
          lines.push('  space   （未绑定）');
        }
        lines.push(`  下一步  ${r.nextCommand}`);
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.space',
      cli: ['sg', 'space'],
      http: ['GET', '/api/service-groups/:id/space'],
      summary: '查看管理空间：方法清单 + 状态堆快照（可 JSON 表示的部分）',
      args: ['id'],
    })(
      (ctx) => service.spaceIntrospect(ctx.id),
      (r) => {
        if (!r.ok) return `✘ 空间装载失败：${r.error}`;
        const lines = ['管理空间:'];
        const methods = r.methods ?? [];
        if (methods.length) {
          lines.push(`  方法（${methods.length}）:`);
          for (const m of methods) lines.push(`    ${m.name}(${m.arity})${m.async ? ' async' : ''}`);
        } else {
          lines.push('  （空间没有方法——在面板里挂 globalThis.xxx = function () {} 或用 defineSpace）');
        }
        const heap = r.heap ?? [];
        if (heap.length) {
          lines.push(`  状态（${heap.length}）:`);
          for (const h of heap) lines.push(`    ${h.key}: ${h.describe}`);
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.spaceCall',
      cli: ['sg', 'space-call'],
      http: ['POST', '/api/service-groups/:id/space-call'],
      summary: '调用管理空间的一个方法（--method 名，--args JSON 数组）',
      args: ['id'],
      flags: {
        method: { type: 'string', required: true, hint: '要调用的方法名' },
        args: { type: 'string', hint: '参数（JSON 数组，如 ["demo-group"]）' },
      },
    })(
      (ctx) => {
        let parsed: unknown[] = [];
        if (ctx.args) {
          try {
            const v = JSON.parse(ctx.args);
            parsed = Array.isArray(v) ? v : [v];
          } catch (err) {
            throw new Error(`--args 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        return service.spaceCall(ctx.id, ctx.method, parsed);
      },
      (r) => {
        if (!r.ok) return `✘ 调用失败：${r.error}`;
        return `✔ ${r.method}() = ${JSON.stringify(r.value)}`;
      },
    ),

    defineAction({
      id: 'serviceGroup.run',
      cli: ['sg', 'run'],
      http: ['POST', '/api/service-groups/:id/run'],
      summary: '执行流水线：空间 check → 启动 main → 等活性就绪 → clients 依次执行',
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
