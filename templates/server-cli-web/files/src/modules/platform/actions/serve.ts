// serve —— 启动 Web 面板（长驻；不写 http 即纯 CLI，面板里没有它的入口）。
//
// 端口占用处理：上面已经是本项目的面板 → 直接打开浏览器（不重复启动）；
// 是别的服务 → 顺延到下一个空闲端口再起自己的面板。两种情况都开浏览器，
// NX_SERVE_NO_OPEN=1 可全局关掉。
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import { APP_NAME, DEFAULT_PORT, storePathFromEnv } from '../../../core/paths.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

const serveInput = z.object({
  port: z.number().optional(),
  'no-open': z.boolean().optional(),
});

export class ServeAction extends ActionBase {
  @action({
    id: 'serve',
    cli: ['serve'],
    summary: '启动 Web 面板（默认 :{{port}}；--port N 改端口；--no-open 不开浏览器；端口上已是本面板则直接打开它；NX_SERVE_NO_OPEN=1 全局不开浏览器）',
    input: serveInput,
  })
  async serve(ctx: z.output<typeof serveInput>): Promise<never> {
    // 动态 import：server → registry → 本模块，静态引入会在装载期成环。
    const { startServer } = await import('../../../runtime/server.js');
    const { openBrowser } = await import('../../../core/open.js');
    const { autoOpenEnabled, resolvePortConflict, describeOccupant } = await import('../../../core/serve-port.js');
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
}
