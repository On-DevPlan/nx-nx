// 系统模块：只做聚合与自检，没有自己的业务状态。
//
// 分层例外：本模块是**刻意的聚合器**，允许 import 其他模块的 service。
// 其余模块之间禁止互相依赖（eslint 的否定式禁列强制，见 eslint.config.js）。
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_DESC, APP_TITLE, storePathFromEnv, STORE_ENV } from '../../core/paths.js';
import { templatesDir } from '../../core/templates.js';
import { badInput } from '../../core/errors/index.js';
import * as template from '../template/service.js';

const VERSION = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
).version;

// 命令表：CLI 命令 ↔ HTTP 路由的对照，bootstrap 与面板的「CLI 等价」提示共用。
//
// 动态 import：runtime/registry 静态依赖本模块，静态引入会形成循环。
// 该函数只在启动完成后被调用，届时 cli.js 早已求值完毕。
async function commandTable() {
  const { ALL_COMMANDS, commandEntry } = await import('../../runtime/cli.js');
  return ALL_COMMANDS.map(commandEntry);
}

// 一次拿齐面板启动所需的全部上下文。
// 面板用 commands 渲染「每个按钮对应的 CLI 命令」，而不是各视图手写字符串——
// 手写的迟早与实际命令脱节。
async function bootstrap() {
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

export default {
  id: 'system',
  title: '系统',
  order: 1,
  actions: [
    {
      id: 'system.bootstrap',
      cli: ['bootstrap', 'show'],
      http: ['GET', '/api/bootstrap'],
      summary: '一次取齐面板启动所需的全部上下文',
      run: () => bootstrap(),
    },
    {
      id: 'system.routes',
      cli: ['routes'],
      http: ['GET', '/api/routes'],
      summary: '列出 CLI 命令与 HTTP 路由的对照表',
      run: async () => {
        const table = await commandTable();
        return {
          status: 'ok',
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
      render: (r) => {
        const lines = [`共 ${r.count} 条命令（CLI ↔ HTTP 对照）`, ''];
        const width = Math.max(...r.routes.map((x) => x.cli.length));
        for (const x of r.routes) {
          lines.push('  ' + x.cli.padEnd(width + 2) + (x.http || '(仅 CLI)') + '   ' + (x.summary || ''));
        }
        return lines.join('\n');
      },
    },
    {
      id: 'system.health',
      cli: ['health'],
      http: ['GET', '/api/health'],
      summary: '自检：模板目录是否可读、有几个模板',
      run: async () => {
        let dir = null;
        let ok = true;
        let reason = '';
        try {
          dir = templatesDir();
        } catch (err) {
          ok = false;
          reason = String((err && err.message) || err);
        }
        const { templates, errors } = ok ? await template.list() : { templates: [], errors: [] };
        return {
          status: ok ? 'ok' : 'blocked',
          templatesDir: dir,
          templates: templates.length,
          broken: errors,
          reason,
        };
      },
      render: (r) =>
        r.status === 'ok'
          ? `正常 · 模板目录 ${r.templatesDir} · ${r.templates} 个模板` +
            (r.broken.length ? `\n⚠ ${r.broken.length} 个模板不合法` : '')
          : `异常 · ${r.reason}`,
    },
    {
      id: 'system.store',
      cli: ['store', 'path'],
      http: ['GET', '/api/store'],
      summary: '显示存储路径（可用环境变量覆盖）',
      run: () => ({ status: 'ok', path: storePathFromEnv(), env: STORE_ENV }),
      render: (r) => `${r.path}    （环境变量 ${r.env} 或 --store 覆盖）`,
    },
  ],
};

// 供其他模块复用的解析工具（system 是唯一允许被跨模块引用的例外之一）
export function parseHttpQuery(input) {
  const s = String(input || '').trim();
  const m = /^([A-Za-z]+)\s+(.*)$/.exec(s);
  const method = m ? m[1].toUpperCase() : null;
  const path = (m ? m[2] : s).split('?')[0];
  if (!path.startsWith('/')) {
    throw badInput(`HTTP 查询需形如 "/api/x" 或 "POST /api/x"，收到: ${input}`);
  }
  return { method, path };
}
