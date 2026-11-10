// home 模块：面板落地页（启动聚合 + 演示业务 + 本机设置）。
//
// 本模块的 action 走 **@action 装饰器单一通道**（zod schema 即契约，见 ./schemas.ts）：
// 方法直接装饰，模块的 actions 字段由 zodActionsOf(this) 从原型上收集——
// 「声明与实现写在一起、类持有服务实例」正是注解式 + OOP 的合流点。
// 全部业务域同一通道，与平台命令（serve/help/version）在同一张注册表汇合。
//
// 注解式的两笔类型债（0.10.0 验证结论，接受并记录）：
//   - handler 入参类型手写 z.output<typeof schema>（装饰器改不了方法签名）；
//   - 路由 :param 与 args 的一致性检查从编译期降级为运行期（zodActionsOf 里红）。
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { APP_NAME, APP_DESC, APP_TITLE, STORE_ENV, storePathFromEnv } from '../../core/paths.js';
import { ModuleBase } from '../../runtime/types/module.js';
import { action, zodActionsOf } from '../../runtime/action-decorator.js';
import { commandEntry, type CommandEntry } from '../../runtime/help.js';
import {
  homeBootstrapInput,
  homeBootstrapOutput,
  homeGreetInput,
  homeGreetOutput,
  homeHealthInput,
  homeHealthOutput,
  homeRoutesInput,
  homeRoutesOutput,
  settingGetInput,
  settingGetOutput,
  settingSetInput,
  settingSetOutput,
} from './schemas.js';
import { homeService as defaultHomeService, renderSettings, renderSettingSet } from './service.js';
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
  // 返回类型必须显式标注：不标的话类型推断会沿 cliApp → registry → 本模块 → actions
  // 绕一圈（TS7022 循环推断，整类退化成 any）。
  private async commandTable(): Promise<CommandEntry[]> {
    const { cliApp } = await import('../../runtime/cli.js');
    return cliApp.commands.map(commandEntry);
  }

  private async buildBootstrap(): Promise<{
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

  @action({
    id: 'home.bootstrap',
    cli: ['bootstrap', 'show'],
    http: ['GET', '/api/bootstrap'],
    summary: '一次取齐面板启动所需的全部上下文',
    input: homeBootstrapInput,
    output: homeBootstrapOutput,
  })
  bootstrap(_ctx: z.output<typeof homeBootstrapInput>) {
    return this.buildBootstrap();
  }

  @action({
    id: 'home.routes',
    cli: ['routes'],
    http: ['GET', '/api/routes'],
    summary: '列出 CLI 命令与 HTTP 路由的对照表',
    input: homeRoutesInput,
    output: homeRoutesOutput,
    render: (r) => {
      const lines = [`共 ${r.count} 条命令（CLI ↔ HTTP 对照）`, ''];
      const width = Math.max(...r.routes.map((x: { cli: string }) => x.cli.length));
      for (const x of r.routes) {
        lines.push('  ' + x.cli.padEnd(width + 2) + (x.http || '(仅 CLI)') + '   ' + (x.summary || ''));
      }
      return lines.join('\n');
    },
  })
  async routes(_ctx: z.output<typeof homeRoutesInput>) {
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
  }

  @action({
    id: 'home.health',
    cli: ['health'],
    http: ['GET', '/api/health'],
    summary: '自检：存储目录是否可写',
    input: homeHealthInput,
    output: homeHealthOutput,
    render: (r) => (r.status === 'ok' ? `正常 · 存储 ${r.storePath}` : `异常 · ${r.reason}`),
  })
  health(_ctx: z.output<typeof homeHealthInput>) {
    return this.svc.health();
  }

  @action({
    id: 'home.greet',
    cli: ['greet'],
    http: ['POST', '/api/greet'],
    summary: '打个招呼（演示动作：问候次数累计进本机存储）',
    args: ['name'],
    input: homeGreetInput,
    output: homeGreetOutput,
    render: (r) => r.greeting,
  })
  greet(ctx: z.output<typeof homeGreetInput>) {
    return this.svc.greet(ctx.name, ctx.loud === true);
  }

  @action({
    id: 'setting.get',
    cli: ['setting', 'get'],
    http: ['GET', '/api/settings'],
    summary: '读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序）',
    input: settingGetInput,
    output: settingGetOutput,
    render: (r) => renderSettings(r as Parameters<typeof renderSettings>[0]),
  })
  getSettings(_ctx: z.output<typeof settingGetInput>) {
    return this.svc.getSettings();
  }

  @action({
    id: 'setting.set',
    cli: ['setting', 'set'],
    http: ['PATCH', '/api/settings'],
    summary: '修改设置（PATCH 语义：只改传入的项）',
    input: settingSetInput,
    output: settingSetOutput,
    render: (r) => renderSettingSet(r as Parameters<typeof renderSettingSet>[0]),
  })
  setSettings(ctx: z.output<typeof settingSetInput>) {
    return this.svc.setSettings(ctx as { key?: string; value?: unknown; set?: Record<string, unknown>; 'dry-run'?: boolean });
  }

  // actions 由装饰器收集（字段放最后：初始化时 id/title 已就绪）。
  override readonly actions = zodActionsOf(this);
}

export const homeModule = new HomeModule();
