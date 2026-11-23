// system 域的启动上下文聚合：命令表与 bootstrap。
//
// 单独成文件的原因：index.ts 现在只做装配（action 清单由脚本生成），
// 而 bootstrap / commandTable 是两条 action 的实现，放这里两边都拿得到。
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_DESC, APP_TITLE, storePathFromEnv, STORE_ENV } from '../../core/paths.js';
import { templatesDir } from '../../core/templates.js';
import { commandEntry } from '../../runtime/help.js';
import * as template from '../template/service.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

// 命令表：CLI 命令 ↔ HTTP 路由的对照，bootstrap 与面板的「CLI 等价」提示共用。
//
// 动态 import cli：runtime/registry 静态依赖本模块，静态引入 ALL_COMMANDS 会形成循环。
// commandEntry 无循环依赖，直接静态引入。
// 该函数只在启动完成后被调用，届时 cli.js 早已求值完毕。
export async function commandTable() {
  const { ALL_COMMANDS } = await import('../../runtime/cli.js');
  return ALL_COMMANDS.map(commandEntry);
}

// 一次拿齐面板启动所需的全部上下文。
// 面板用 commands 渲染「每个按钮对应的 CLI 命令」，而不是各视图手写字符串——
// 手写的迟早与实际命令脱节。
export async function bootstrap() {
  const { templates, errors } = await template.list();
  return {
    app: { name: APP_NAME, title: APP_TITLE, description: APP_DESC, version: VERSION },
    storePath: storePathFromEnv(),
    storeEnv: STORE_ENV,
    templatesDir: templatesDir(),
    templates,
    templateErrors: errors,
    commands: await commandTable(),
  };
}
