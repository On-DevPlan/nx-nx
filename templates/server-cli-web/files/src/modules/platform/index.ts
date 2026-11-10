// 平台模块：serve / help / version 三个平台命令。
//
// 它们不属于任何业务域，但走与业务 action 完全相同的单一通道（@action 装饰器 +
// zod 契约）——CliApp 因此只有一条解析路径，没有「平台命令特判」。
//
// http 缺省 = 纯 CLI（Registry 装载检查按「缺省即 CLI-only」处理）：
//   - serve 天然是 CLI 侧能力（起进程、占端口，面板没有入口）；
//   - help / version 同理——它们的面板等价物是界面本身与页眉的版本徽章。
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { APP_NAME, DEFAULT_PORT, storePathFromEnv } from '../../core/paths.js';
import { ModuleBase } from '../../runtime/types/module.js';
import { action, zodActionsOf } from '../../runtime/action-decorator.js';
import { commandEntry, helpEntries, renderHelp, type CommandEntry } from '../../runtime/help.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

// ---- 输入契约 ----
const serveInput = z.object({
  port: z.number().optional(),
  'no-open': z.boolean().optional(),
});
const helpInput = z.object({
  topic: z.string().optional(),
});
const versionInput = z.object({});

export class PlatformModule extends ModuleBase {
  override readonly id = 'platform';
  override readonly title = '平台';
  override readonly order = 0;

  // 命令表：CLI 命令 ↔ HTTP 路由的对照（help 的渲染与派发都靠它）。
  // 动态 import cli：registry 静态依赖本模块，静态引入 CliApp 会形成循环。
  // 返回类型必须显式标注：不标会沿 cliApp → registry → 本模块 → actions 绕成
  // 循环推断（TS7022，整类退化 any）——与 home 模块同一坑。
  private async commandTable(): Promise<CommandEntry[]> {
    const { cliApp } = await import('../../runtime/cli.js');
    return cliApp.commands.map(commandEntry);
  }

  @action({
    id: 'serve',
    cli: ['serve'],
    summary: '启动 Web 面板（默认 :{{port}}；--port N 改端口；--no-open 不开浏览器；端口上已是本面板则直接打开它；NX_SERVE_NO_OPEN=1 全局不开浏览器）',
    input: serveInput,
  })
  async serve(ctx: z.output<typeof serveInput>): Promise<never> {
    // 动态 import：server → registry → 本模块，静态引入会在装载期成环。
    const { startServer } = await import('../../runtime/server.js');
    const { openBrowser } = await import('../../core/open.js');
    const { autoOpenEnabled, resolvePortConflict, describeOccupant } = await import('../../core/serve-port.js');
    const host = '127.0.0.1';
    const desiredPort = ctx.port || DEFAULT_PORT;
    // --no-open 与 NX_SERVE_NO_OPEN 都看这里：后者是所有 nx-xx 项目共享的开关
    const canOpen = autoOpenEnabled(ctx['no-open'] === true);

    let server: Awaited<ReturnType<typeof startServer>>;
    try {
      server = await startServer({ port: desiredPort, host });
    } catch (err) {
      if (!err || (err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;

      // 端口被占：先问一句「上面跑的是不是我」。
      const decision = await resolvePortConflict(desiredPort, APP_NAME, host);

      if (decision.action === 'reuse') {
        // 自己的面板已经在跑：不重复启动，直接把浏览器指过去。
        const addr = `http://${host}:${desiredPort}`;
        console.log(APP_NAME + ' 已在运行：' + addr);
        console.log('直接打开浏览器（不重复启动）；如需重启请先停掉旧实例');
        if (canOpen) openBrowser(addr);
        return new Promise<never>(() => undefined); // 常驻：由 SIGINT/SIGTERM 结束
      }

      // 别人占的：顺延到下一个空闲端口，再起自己的面板。
      console.log(
        `端口 ${desiredPort} 已被占用（占用者: ${describeOccupant(decision.occupant)}），改用 ${decision.port}`
      );
      server = await startServer({ port: decision.port, host });
    }

    const bound = server.address();
    const actualPort = typeof bound === 'object' && bound ? bound.port : desiredPort;
    const addr = `http://${host}:${actualPort}`;

    console.log(APP_NAME + ' v' + VERSION);
    console.log(`面板:   ${addr}`);
    console.log(`存储:   ${storePathFromEnv()}`);
    console.log('CLI:    ' + APP_NAME + ' help（每个按钮都有对应命令，agent 可加 --json）');
    console.log('按 Ctrl+C 停止');

    if (canOpen) openBrowser(addr);

    const shutdown = () => {
      console.log('\n正在停止...');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return new Promise<never>(() => undefined); // 常驻：由 SIGINT/SIGTERM 结束
  }

  @action({
    id: 'help',
    cli: ['help'],
    summary: '显示帮助（可跟模块名或命令组，如 {{name}} help home）',
    // topic 是**位置参数**（`help home`）：zod 通道里位置性由 args 声明，
    // 漏写就会变成「多余的参数」。
    args: ['topic'],
    input: helpInput,
    render: (entries, ctx) => renderHelp(entries as CommandEntry[], (ctx as { topic?: string } | undefined)?.topic),
  })
  async help(ctx: z.output<typeof helpInput>): Promise<CommandEntry[]> {
    // 走标准 action 形态：--json 时 emit 会序列化返回的条目，
    // 于是 `help --json` 输出的是可解析的命令表而非帮助文本
    const { cliApp } = await import('../../runtime/cli.js');
    return helpEntries(ctx.topic, cliApp.commands.map(commandEntry));
  }

  // render 让 `{{name}} version` 输出裸版本号（脚本里可 `V=$({{name}} version)`），
  // 而 `--json` 仍走序列化，保持机器可读
  @action({
    id: 'version',
    cli: ['version'],
    summary: '显示版本',
    input: versionInput,
    render: (v) => v,
  })
  version() {
    return VERSION;
  }

  // actions 由装饰器收集（字段放最后：初始化时 id/title 已就绪）。
  override readonly actions = zodActionsOf(this);
}

export const platformModule = new PlatformModule();
