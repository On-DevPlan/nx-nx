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
import { formatSpace, formatSpaceCall } from './space-text.js';
import { formatInit, formatTemplates } from './template-text.js';
import { formatGroupList, formatGroupShow } from './group-text.js';
import { initInput, setInput, startInput, stopInput, autohealInput, spaceCallInput, idInput, statusInput, groupScriptOpInput } from './schemas.js';

export default defineModule({
  id: 'service-group',
  title: '服务',
  order: 35,
  actions: [
    defineAction({
      id: 'serviceGroup.templates',
      cli: ['sg', 'templates'],
      http: ['GET', '/api/service-templates'],
      summary: '列出服务组模板（模板 = 脚本 + 配置 + 下一步命令；默认 node-ping）',
    })(
      () => ({ templates: service.templates() }),
      (r) => formatTemplates(r.templates),
    ),

    defineAction({
      id: 'serviceGroup.init',
      cli: ['sg', 'init'],
      http: ['POST', '/api/service-groups-init/:id'],
      summary: '按模板创建服务组：生成脚本 + 写配置 + 打印下一步（默认模板 node-ping）',
      args: ['id'],
      flags: {
        template: { type: 'string', default: 'node-ping', hint: '模板 id（sg templates 查看）' },
        port: { type: 'number', hint: '监听端口（默认取模板配置）' },
        name: { type: 'string', hint: '显示名（默认取模板配置）' },
        force: { type: 'boolean', hint: '覆盖已存在的同名脚本与服务组' },
        dry: { type: 'boolean', hint: '只看会生成什么，不落盘' },
      },
      // 命令行表面（help / 强转）由上表描述，合法性在这里收口：
      // id 正则与模板里的校验同一口径，端口范围不再靠 service 里手写判断兜底。
      schema: initInput,
    })(
      (ctx) =>
        service.initFromTemplate({
          groupId: ctx.id,
          templateId: ctx.template,
          port: ctx.port,
          name: ctx.name,
          force: ctx.force,
          dryRun: ctx.dry,
        }),
      (r) => formatInit(r),
    ),

    defineAction({
      id: 'serviceGroup.list',
      cli: ['sg', 'list'],
      http: ['GET', '/api/service-groups'],
      summary: '列出服务组（配置 + 运行态）',
    })(
      () => ({ groups: service.listGroups() }),
      (r) => formatGroupList(r.groups),
    ),

    defineAction({
      id: 'serviceGroup.show',
      cli: ['sg', 'show'],
      http: ['GET', '/api/service-groups/:id'],
      summary: '查看服务组配置与运行态详情',
      args: ['id'],
      schema: idInput,
    })(
      (ctx) => service.showGroup(ctx.id),
      (r) => formatGroupShow(r),
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
      schema: setInput,
    })(
      (ctx) => service.setGroup(ctx.id, ctx.config),
      (r) =>
        `已保存服务组 ${r.id}（${r.name}）\n  main: ${r.main?.script ?? '(未配置)'} · health: ${r.health ? r.health.kind + ':' + r.health.port : '无'} · 关闭: mode=${r.stopMode} · clients: ${r.clients.join(', ') || '无'}`,
        // 示例配置只在「需要教用户怎么写」的地方出现（空态提示 / help）。
        // 每次保存成功都甩一遍 10 行 JSON，等于把真正的结果埋掉。
    ),

    defineAction({
      id: 'serviceGroup.delete',
      cli: ['sg', 'delete'],
      http: ['DELETE', '/api/service-groups/:id'],
      summary: '删除服务组（先停止运行中的服务）',
      args: ['id'],
      schema: idInput,
    })(
      (ctx) => service.deleteGroup(ctx.id),
      (r) => `已删除服务组 ${r.id}（${r.stopped}）`,
    ),

    defineAction({
      id: 'serviceGroup.start',
      cli: ['sg', 'start'],
      http: ['POST', '/api/service-groups/:id/start'],
      summary: '启动主脚本（detached + 日志重定向；可按启动参数覆盖端口 / 配置文件 / 环境）',
      args: ['id'],
      flags: {
        values: { type: 'string', hint: '启动参数 JSON，如 {"port":"18081","env":"prod"}' },
      },
      schema: startInput,
    })(
      (ctx) => service.start(ctx.id, ctx.values),
      (r) => (r.started ? `已启动 (pid ${r.pid})\n  日志: ${r.logFile}` : `未重复启动：${r.detail}`),
    ),

    defineAction({
      id: 'serviceGroup.stop',
      cli: ['sg', 'stop'],
      http: ['POST', '/api/service-groups/:id/stop'],
      summary: '关闭服务：按 stopMode 走（auto=关停脚本→杀端口→杀 pid；script/port/pid 只走单条）',
      args: ['id'],
      flags: {
        mode: { type: 'string', hint: '本次覆盖 stopMode: auto | script | port | pid' },
      },
      schema: stopInput,
    })(
      (ctx) => service.stop(ctx.id, ctx.mode),
      (r) => `已关闭（mode=${r.mode}）：${r.detail}`,
    ),

    defineAction({
      id: 'serviceGroup.autoheal',
      cli: ['sg', 'autoheal'],
      http: ['POST', '/api/service-groups/:id/autoheal'],
      summary: '自愈开关：state=on 失活即重启 / state=off 只记录不处理（监控不停）',
      args: ['id'],
      flags: {
        state: { type: 'string', required: true, hint: 'on | off' },
      },
      schema: autohealInput,
    })(
      (ctx) => service.autoheal(ctx.id, ctx.state),
      (r) =>
        `服务组 ${r.id} 自愈已${r.autoHeal ? '开启（失活即重启）' : '关闭（只记录，监控不停）'}` +
        (r.watching ? '\n  当前在运行：监控已按新设置重建' : '\n  当前未运行：下次启动时生效'),
    ),

    defineAction({
      id: 'serviceGroup.status',
      cli: ['sg', 'status'],
      http: ['GET', '/api/service-groups-runtime'],
      summary: '查看运行态快照（不带 id 看全部）',
      args: [{ name: 'id', required: false }],
      schema: statusInput,
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
      schema: idInput,
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
      schema: idInput,
    })(
      (ctx) => service.logs(ctx.id),
      (r) => {
        const lines: string[] = [];
        if (r.events.trim()) lines.push('事件日志:', r.events.trimEnd());
        if (r.main.trim()) lines.push('主脚本日志（尾部）:', r.main.trimEnd());
        if (r.clients.trim()) lines.push('client 执行记录:', r.clients.trimEnd());
        if (r.http.length) {
          lines.push(`HTTP 请求日志（${r.http.length} 条，最近在前）:`);
          for (const h of r.http.slice(0, 20)) lines.push(`  ${h.name}  ${h.size} 字节`);
        }
        if (!lines.length) lines.push('（该服务组还没有日志）');
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'serviceGroup.script',
      cli: ['sg', 'script'],
      http: ['POST', '/api/service-groups/:id/script'],
      summary: '组内脚本入口：--op read/save/create/delete（全部在服务组命名空间内，不碰全局脚本模块）',
      args: ['id'],
      flags: {
        op: { type: 'string', default: 'read', hint: 'read | save | create | delete' },
        name: { type: 'string', hint: '脚本名（不含 .mjs，不能带路径）' },
        content: { type: 'string', hint: 'save / create 的脚本全文' },
      },
      schema: groupScriptOpInput,
    })(
      (ctx) => service.groupScriptOp(ctx.id, ctx.op, ctx.name, ctx.content),
      (r) => {
        if (r.op === 'read') return `// ${r.groupId}/${r.name}  ${r.path}\n${r.content ?? ''}`;
        if (r.op === 'delete') return `已删除 ${r.groupId}/${r.name}: ${r.path}`;
        return `已${r.op === 'create' ? '创建' : '保存'} ${r.groupId}/${r.name}: ${r.path}`;
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
      schema: idInput,
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
      schema: idInput,
    })(
      (ctx) => service.spaceIntrospect(ctx.id),
      (r) => formatSpace(r),
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
      schema: spaceCallInput,
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
      (r) => formatSpaceCall(r),
    ),

    defineAction({
      id: 'serviceGroup.run',
      cli: ['sg', 'run'],
      http: ['POST', '/api/service-groups/:id/run'],
      summary: '一键运行测试组：空间 check → 启动 main → 等活性就绪 → clients / 测试脚本依次执行',
      args: ['id'],
      flags: {
        values: { type: 'string', hint: '启动参数 JSON，如 {"port":"18081","env":"prod"}' },
      },
      schema: startInput,
    })(
      (ctx) => service.run(ctx.id, ctx.values),
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
