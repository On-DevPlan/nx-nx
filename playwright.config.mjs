// Playwright 配置：用**本机 Chrome**（channel: 'chrome'），不下载浏览器包。
//
// 为什么起一个独立 serve：E2E 必须点真实的 HTTP + 真实的文件系统，
// 不能把 UI 组件单独渲染成快照。数据目录指向 .e2e-home（globalSetup 里重建），
// 因此测试创建的服务组不会污染用户自己的 ~/.nx-nx。
import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const HOME = join(process.cwd(), '.e2e-home');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.mjs',
  globalTeardown: './tests/e2e/global-teardown.mjs',
  use: {
    baseURL: 'http://127.0.0.1:7999',
    channel: 'chrome',
    headless: true,
    // 本机 Chrome 在部分 Windows 会话里会卡在默认 sandbox 启动：显式关掉，
    // 这只影响测试浏览器，不影响面板本身。
    launchOptions: { args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node bin/nx-nx.mjs serve --port 7999 --no-open',
    url: 'http://127.0.0.1:7999/api/bootstrap',
    reuseExistingServer: false,
    timeout: 45_000,
    env: {
      NX_NX_HOME: HOME,
      NX_NX_SCRIPTS: join(HOME, 'scripts'),
      NX_SERVE_NO_OPEN: '1',
    },
  },
});
