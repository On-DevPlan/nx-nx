// home.bootstrap —— 一次拿齐面板启动所需的全部上下文（应用信息 + 存储 + 命令表）。
//
// 面板用 commands 渲染「每个按钮对应的 CLI 命令」，而不是视图手写字符串——
// 手写的迟早与实际命令脱节。
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import { APP_NAME, APP_DESC, APP_TITLE, STORE_ENV, storePathFromEnv } from '../../../core/paths.js';
import { commandEntry, type CommandEntry } from '../../../runtime/help.js';
import { homeBootstrapInput, homeBootstrapOutput } from '../schemas.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export class BootstrapAction extends ActionBase {
  @action({
    id: 'home.bootstrap',
    cli: ['bootstrap', 'show'],
    http: ['GET', '/api/bootstrap'],
    summary: '一次取齐面板启动所需的全部上下文',
    input: homeBootstrapInput,
    output: homeBootstrapOutput,
  })
  async bootstrap(_ctx: z.output<typeof homeBootstrapInput>): Promise<{
    app: { name: string; title: string; description: string; version: string };
    storePath: string;
    storeEnv: string;
    commands: CommandEntry[];
  }> {
    // 动态 import cli：registry 静态依赖本模块，静态引入 CliApp 会形成循环。
    // 返回类型必须显式标注：不标的话类型推断会沿 cliApp → registry → 本模块 →
    // actions 绕一圈（TS7022 循环推断，整类退化成 any）。
    const { cliApp } = await import('../../../runtime/cli.js');
    return {
      app: { name: APP_NAME, title: APP_TITLE, description: APP_DESC, version: VERSION },
      storePath: storePathFromEnv(),
      storeEnv: STORE_ENV,
      commands: cliApp.commands.map(commandEntry),
    };
  }
}
