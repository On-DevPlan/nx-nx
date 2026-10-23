// 系统模块：只做聚合与自检，没有自己的业务状态。
//
// 分层例外：本模块是**刻意的聚合器**，允许 import 其他模块的 service。
// 其余模块之间禁止互相依赖（eslint 的否定式禁列强制，见 eslint.config.js）。
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_DESC, APP_TITLE, storePathFromEnv, STORE_ENV } from '../../core/paths.js';
import { templatesDir } from '../../core/templates.js';
import { openBrowser } from '../../core/open.js';
import { badInput } from '../../core/errors/index.js';
import { defineAction } from '../../runtime/types/action.js';
import { defineModule } from '../../runtime/types/module.js';
import { commandEntry } from '../../runtime/help.js';
import * as template from '../template/service.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

// 命令表：CLI 命令 ↔ HTTP 路由的对照，bootstrap 与面板的「CLI 等价」提示共用。
//
// 动态 import cli：runtime/registry 静态依赖本模块，静态引入 ALL_COMMANDS 会形成循环。
// commandEntry 无循环依赖，直接静态引入（见顶部 import）。
// 该函数只在启动完成后被调用，届时 cli.js 早已求值完毕。
async function commandTable() {
  const { ALL_COMMANDS } = await import('../../runtime/cli.js');
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

export default defineModule({
  id: 'system',
  title: '系统',
  order: 1,
  actions: [
    defineAction({
      id: 'system.bootstrap',
      cli: ['bootstrap', 'show'],
      http: ['GET', '/api/bootstrap'],
      summary: '一次取齐面板启动所需的全部上下文',
    })(() => bootstrap()),

    defineAction({
      id: 'system.routes',
      cli: ['routes'],
      http: ['GET', '/api/routes'],
      summary: '列出 CLI 命令与 HTTP 路由的对照表',
    })(
      async () => {
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
      id: 'system.health',
      cli: ['health'],
      http: ['GET', '/api/health'],
      summary: '自检：模板目录是否可读、有几个模板',
    })(
      async () => {
        let dir: string | null = null;
        let ok = true;
        let reason = '';
        try {
          dir = templatesDir();
        } catch (err) {
          ok = false;
          reason = String((err as { message?: string })?.message || err);
        }
        const { templates, errors } = ok
          ? await template.list()
          : { templates: [], errors: [] as { id: string; message: string }[] };
        return {
          status: ok ? 'ok' : 'blocked',
          templatesDir: dir,
          templates: templates.length,
          broken: errors,
          reason,
        };
      },
      (r) =>
        r.status === 'ok'
          ? `正常 · 模板目录 ${r.templatesDir} · ${r.templates} 个模板` +
            (r.broken.length ? `\n${r.broken.length} 个模板不合法` : '')
          : `异常 · ${r.reason}`,
    ),

    defineAction({
      id: 'system.store',
      cli: ['store', 'path'],
      http: ['GET', '/api/store'],
      summary: '显示存储路径（可用环境变量覆盖）',
    })(
      () => ({ status: 'ok', path: storePathFromEnv(), env: STORE_ENV }),
      (r) => `${r.path}    （环境变量 ${r.env} 或 --store 覆盖）`,
    ),

    defineAction({
      id: 'system.open',
      cli: ['open'],
      http: ['POST', '/api/open'],
      summary: '用默认浏览器打开本机服务：open 7822 / open localhost:7822 / open <URL>',
      args: ['target'],
    })(
      async (ctx) => {
        const { url, port } = normalizeOpenTarget(ctx.target);
        // 探测只是「锦上添花」，只对本机端口做：服务可能起得慢，浏览器开在前面
        // 等它，比让用户再敲一遍命令强。探不到也照样打开，但要说清楚为什么。
        const listening = port === null ? null : !(await template.probePort(port));
        openBrowser(url);
        return { status: 'ok', url, listening };
      },
      (r) =>
        r.listening === false
          ? `${r.url} 上没有探测到服务（可能还没启动）——浏览器已打开，服务起好刷新即可`
          : `已打开 ${r.url}`,
    ),
  ],
});

// 「open 目标」归一：三种形态都收——纯端口（可带路径）、host:port、完整 URL。
// port 仅当目标确属本机（localhost / 127.0.0.1 / [::1]）才返回，供探针判断
// 服务在不在；外部地址探测没有意义，probePort 只会给出误导性答案。
export function normalizeOpenTarget(input: unknown): { url: string; port: number | null } {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw badInput('open 需要一个目标：端口（7822）、host:port（localhost:7822）或完整 URL');
  }
  // 纯端口先行截住：直接拼 scheme 的话，http://7822 会被 URL 解析成主机名 7822
  const bare = /^(\d{1,5})(\/.*)?$/.exec(raw);
  if (bare) {
    const port = Number(bare[1]);
    if (port < 1 || port > 65535) {
      throw badInput(`端口越界（1~65535）: ${bare[1]}`);
    }
    return { url: `http://localhost:${port}${bare[2] || ''}`, port };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  // 数字主机名要在解析前拦：URL 解析器会把「7822」当 IPv4 数值地址规范化成
  // 0.0.30.142，解析后就认不出来了。典型误写 "7822:80"——用户想要的是本机端口。
  const authority = withScheme.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]!;
  const withAuth = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  const hostOnly = withAuth.startsWith('[') ? withAuth.slice(0, withAuth.indexOf(']') + 1) : withAuth.split(':')[0]!;
  if (/^\d+$/.test(hostOnly)) {
    throw badInput(`「${raw}」会解析成数字主机名。想开本机端口直接写端口就行: nx-nx open ${hostOnly}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw badInput(`打不开这个目标: ${input}（试 7822 / localhost:7822 / https://…）`);
  }
  const port = parsed.port ? Number(parsed.port) : null;
  if (port !== null && (port < 1 || port > 65535)) {
    throw badInput(`端口越界（1~65535）: ${parsed.port}`);
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  return { url: parsed.href, port: isLocal ? port : null };
}

// 供其他模块复用的解析工具（system 是唯一允许被跨模块引用的例外之一）
export function parseHttpQuery(input: unknown): { method: string | null; path: string } {
  const s = String(input || '').trim();
  const m = /^([A-Za-z]+)\s+(.*)$/.exec(s);
  const method = m ? m[1]!.toUpperCase() : null;
  const path = (m ? m[2]! : s).split('?')[0]!;
  if (!path.startsWith('/')) {
    throw badInput(`HTTP 查询需形如 "/api/x" 或 "POST /api/x"，收到: ${input}`);
  }
  return { method, path };
}
