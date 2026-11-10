// home 模块：面板落地页，承担「启动聚合 + 演示业务 + 本机设置」三类职责。
//
// serve 端的 OOP 约定：模块是 ModuleBase 的**子类**——只读字段声明 id/title/actions，
// 私有方法做装配期聚合（bootstrap / commandTable），业务编排调服务类
// （HomeService，构造注入，测试可换实现）。actions 数组 as const：装载检查的
// 类型机器靠只读元组逐元素析构每条 action 的字面量声明。
//
// 这是新骨架自带的示例功能域，演示一条 action 如何同时暴露为 CLI 与 HTTP：
//   - 面板上的问候按钮 ↔ `{{name}} greet <名字>` 是同一份声明
//   - 设置（主题 / 头部导航）↔ `{{name}} setting get|set` 是同一份声明
//   - 参数名、flag 类型、返回数据全部由类型系统在编译期检查
//
// 为什么首页和设置合成一个模块：两者都是「关于这个应用本身」的内容——
// 启动上下文（bootstrap / 命令表 / 健康）、演示动作（greet）与本机设置（主题 / 头部导航）。
// 拆成两个模块，初始就凭空多出一个只有 meta 信息的空壳页；合成一个，出厂模块都有真实内容。
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_DESC, APP_TITLE, STORE_ENV, storePathFromEnv } from '../../core/paths.js';
import { defineAction } from '../../runtime/types/action.js';
import { ModuleBase } from '../../runtime/types/module.js';
import { commandEntry, type CommandEntry } from '../../runtime/help.js';
import {
  homeService as defaultHomeService,
  renderSettings,
  renderSettingSet,
} from './service.js';
import type { HomeService } from './service.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export class HomeModule extends ModuleBase {
  override readonly id = 'home';
  override readonly title = '首页';
  override readonly order = 1;

  constructor(private svc: HomeService = defaultHomeService) {
    super();
  }

  // 命令表：CLI 命令 ↔ HTTP 路由的对照，bootstrap 与面板的「CLI 等价」提示共用。
  //
  // 动态 import cli：registry 静态依赖本模块，静态引入 CliApp 会形成循环。
  // 该方法只在启动完成后被调用，届时 cli.js 早已求值完毕。
  // 返回类型必须显式标注：不标的话类型推断会沿 cliApp → registry → 本模块 → actions
  // → bootstrap → commandTable 绕一圈（TS7022 循环推断，整类退化成 any）。
  private async commandTable(): Promise<CommandEntry[]> {
    const { cliApp } = await import('../../runtime/cli.js');
    return cliApp.commands.map(commandEntry);
  }

  // 一次拿齐面板启动所需的全部上下文。
  // 面板用 commands 渲染「每个按钮对应的 CLI 命令」，而不是视图手写字符串——
  // 手写的迟早与实际命令脱节。
  private async bootstrap(): Promise<{
    app: { name: string; title: string; description: string; version: string };
    storePath: string;
    storeEnv: string;
    commands: CommandEntry[];
  }> {
    return {
      app: { name: APP_NAME, title: APP_TITLE, description: APP_DESC, version: VERSION },
      storePath: storePathFromEnv(),
      storeEnv: STORE_ENV,
      commands: await this.commandTable(),
    };
  }

  override readonly actions = [
    defineAction({
      id: 'home.bootstrap',
      cli: ['bootstrap', 'show'],
      http: ['GET', '/api/bootstrap'],
      summary: '一次取齐面板启动所需的全部上下文',
    })(() => this.bootstrap()),

    defineAction({
      id: 'home.routes',
      cli: ['routes'],
      http: ['GET', '/api/routes'],
      summary: '列出 CLI 命令与 HTTP 路由的对照表',
    })(
      async () => {
        const table = await this.commandTable();
        return {
          status: 'ok' as const,
          count: table.length,
          routes: table.map((c) => ({
            id: c.id,
            module: c.module,
            cli: c.command,
            http: c.http ? `${c.http.method} ${c.http.path}` : null,
            summary: c.summary,
          })),
        };
      },
      (r) => {
        const lines = [`共 ${r.count} 条命令（CLI ↔ HTTP 对照）`, ''];
        const width = Math.max(...r.routes.map((x) => x.cli.length));
        for (const x of r.routes) {
          lines.push('  ' + x.cli.padEnd(width + 2) + (x.http || '(仅 CLI)') + '   ' + (x.summary || ''));
        }
        return lines.join('\n');
      },
    ),

    defineAction({
      id: 'home.health',
      cli: ['health'],
      http: ['GET', '/api/health'],
      summary: '自检：存储目录是否可写',
    })(
      () => this.svc.health(),
      (r) => (r.status === 'ok' ? `正常 · 存储 ${r.storePath}` : `异常 · ${r.reason}`),
    ),

    defineAction({
      id: 'home.greet',
      cli: ['greet'],
      http: ['POST', '/api/greet'],
      summary: '打个招呼（演示动作：问候次数累计进本机存储）',
      args: [{ name: 'name', required: true }],
      flags: { loud: { type: 'boolean' } },
    })(
      (ctx) => this.svc.greet(ctx.name, !!ctx.loud),
      (r) => r.greeting,
    ),

    defineAction({
      id: 'setting.get',
      cli: ['setting', 'get'],
      http: ['GET', '/api/settings'],
      summary: '读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序）',
    })(() => this.svc.getSettings(), (d) => renderSettings(d)),

    defineAction({
      id: 'setting.set',
      cli: ['setting', 'set'],
      http: ['PATCH', '/api/settings'],
      summary: '修改设置（PATCH 语义：只改传入的项）',
      flags: {
        key: { type: 'string', hint: '设置项名' },
        value: { type: 'string', hint: '取值' },
        set: { type: 'kv', hint: 'k=v，可重复（值可以是 JSON 数组，如 navGroups=[{...}]）' },
        'dry-run': { type: 'boolean' },
      },
    })(
      (ctx) => this.svc.setSettings(ctx as { key?: string; value?: unknown; set?: Record<string, unknown>; 'dry-run'?: boolean }),
      (d) => renderSettingSet(d),
    ),
  ] as const;
}

export const homeModule = new HomeModule();
