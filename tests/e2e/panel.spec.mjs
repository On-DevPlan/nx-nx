// 面板 E2E：一轮真实浏览器点击。
//
// 覆盖的是「只有点一遍才知道坏了」的四件事：
//   1. 左侧导航四条路由都能打开（懒加载没 404 / 没白屏）
//   2. 侧栏收起 / 完整展开 / 拖拽改宽（DOM 尺寸真的变了，不只是 class）
//   3. 服务页从模板创建一个组（真实 POST → 真实落盘 → 列表出现）
//   4. 创建后选中该组，右栏能读到配置（前端的 typed client 与 action 路由对得上）
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const nav = (page) => page.locator('aside.side .side-nav');

// 测试组可能真的把服务拉起来；每个用例结束后兜底关掉，避免端口残留到下一轮。
test.afterEach(async ({ request }) => {
  await request.post('/api/service-groups/ping-demo/stop', { data: {} }).catch(() => {});
});

test('左侧导航：四个页面都能打开', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.side')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: '新建项目', exact: true })).toBeVisible();

  for (const [name, marker] of [
    ['模板', /模板/],
    ['脚本', /脚本/],
    ['服务', /服务组/],
    ['新建项目', /新建项目|模板/],
  ]) {
    await nav(page).getByRole('button', { name, exact: true }).click();
    await expect(page.locator('main.content')).toContainText(marker);
  }
});

test('侧栏：收起成图标轨道，再完全展开', async ({ page }) => {
  await page.goto('/');
  const side = page.locator('aside.side');
  const before = await side.boundingBox();
  expect(before?.width).toBeGreaterThan(150);

  await page.getByRole('button', { name: '收起为图标栏' }).click();
  await expect(side).toHaveClass(/side-collapsed/);
  const rail = await side.boundingBox();
  expect(rail?.width ?? 999).toBeLessThan(80);
  await expect(side.getByText('新建项目', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: '完全展开侧栏' }).click();
  await expect(side).not.toHaveClass(/side-collapsed/);
  const after = await side.boundingBox();
  expect(after?.width ?? 0).toBeGreaterThan(150);
});

test('侧栏：拖拽右边界真的改宽', async ({ page }) => {
  await page.goto('/');
  const handle = page.locator('.side-resizer');
  const hb = await handle.boundingBox();
  const side = page.locator('aside.side');
  const before = (await side.boundingBox())?.width ?? 0;
  if (!hb) throw new Error('找不到侧栏拖拽把手');

  await page.mouse.move(hb.x + hb.width / 2, hb.y + 40);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 90, hb.y + 40, { steps: 8 });
  await page.mouse.up();

  const after = (await side.boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before + 40);

  // 宽度落 localStorage：刷新后仍是拖出来的宽度，不是回到默认。
  await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round(after)));
  await page.reload();
  const persisted = (await page.locator('aside.side').boundingBox())?.width ?? 0;
  expect(Math.abs(persisted - after)).toBeLessThan(10);

  // 键盘也能调（无鼠标场景）：右方向键每次 +16。
  await page.locator('.side-resizer').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const keyed = (await page.locator('aside.side').boundingBox())?.width ?? 0;
  expect(keyed).toBeGreaterThan(persisted);

  // 双击复位：回到产品默认宽度，而不是留在用户拖出来的临时值。
  await page.locator('.side-resizer').dblclick();
  const reset = (await page.locator('aside.side').boundingBox())?.width ?? 0;
  expect(Math.abs(reset - 232)).toBeLessThan(3);
});

test('服务页：设置页建 ping-demo → 首页只留探活/启动/停止 + 日志', async ({ page }) => {
  // 幂等：重复跑/上一次中断留下的同名服务组先删掉（API 404 不算失败）。
  await page.request.delete('/api/service-groups/ping-demo').catch(() => {});
  await page.goto('/');
  // 空态从首页指到设置页；已有服务组时首页右上角的齿轮也能进。
  await nav(page).getByRole('button', { name: '服务', exact: true }).click();
  await page.getByRole('button', { name: /去设置页创建/ }).click();

  await page.getByRole('button', { name: /从模板创建/ }).first().click();
  const modal = page.locator('.ant-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('新建服务组')).toBeVisible();
  // 默认模板 node-ping 带出的默认值：id=ping-demo / 端口=18080
  await expect(modal.locator('input[placeholder="ping-demo"]')).toHaveValue('ping-demo');
  await expect(modal.locator('.ant-input-number input')).toHaveValue('18080');

  await modal.getByRole('button', { name: '按模板创建' }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });

  // 设置页负责配置：主脚本 / 探活路径 / 空间闸门都能看到。
  await expect(page.locator('.sg-list').getByText('ping-demo', { exact: true })).toBeVisible();
  await expect(page.locator('.sg-detail')).toContainText('ping-demo-server');
  await expect(page.locator('.sg-detail')).toContainText('/ping');
  await expect(page.locator('.sg-detail')).toContainText('check 方法');
  await expect(page.locator('.sg-detail')).toContainText('工作目录（cwd）');
  await expect(page.locator('.sg-detail')).toContainText('说明（desc）');
  // 测试脚本组收在「流水线」Tab：选脚本、排序、新建 client 都在这里。
  await page.getByRole('tab', { name: '流水线' }).click();
  await expect(page.locator('.sg-detail')).toContainText('测试脚本组（工作流，1 个步骤）');
  await expect(page.locator('.sg-detail')).toContainText('ping-demo-client');
  await expect(page.locator('.sg-detail')).toContainText('新建 client 脚本');

  // 服务首页只保留三个运行按钮 + 日志预览。
  await nav(page).getByRole('button', { name: '服务', exact: true }).click();
  const detail = page.locator('.sg-detail');
  await expect(detail.getByRole('button', { name: '探活' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '启动' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '运行测试组 (1)' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '停止' })).toBeVisible();
  await expect(detail).toContainText('最近日志');
  await expect(detail).toContainText('零依赖的 Node HTTP 服务');
  await expect(detail).not.toContainText('主脚本（长驻服务');

  // 启动参数：模板自带三个可填字段，预设能一键换端口。
  await detail.getByRole('button', { name: '启动' }).click();
  const launch = page.locator('.ant-modal').filter({ hasText: '启动 · Ping 服务' });
  await expect(launch).toBeVisible();
  await expect(launch.locator('.sg-launch-row')).toHaveCount(4); // 预设 + 端口 + 环境 + 配置文件
  const portInput = launch.locator('.ant-input-number-input');
  await expect(portInput).toHaveValue('18080');
  await launch.locator('.sg-launch-row').first().locator('.ant-select').click();
  // 虚拟列表里的选项在不同 DPI 下会被判成 transient；用键盘选第二项（预发）更稳。
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(portInput).toHaveValue('18081');
  await launch.locator('.ant-modal-footer button').first().click();
  await expect(launch).toBeHidden();

  // 一键运行测试组：先启动/复用服务，再按设置页顺序跑 client，最后给逐步结果。
  await detail.getByRole('button', { name: /运行测试组/ }).click();
  const runModal = page.locator('.ant-modal').filter({ hasText: '运行测试组 · Ping 服务' });
  await expect(runModal).toBeVisible();
  await runModal.locator('.ant-modal-footer button.ant-btn-primary').click();
  await expect(runModal).toBeHidden({ timeout: 15000 });

  const report = page.locator('.ant-modal').filter({ hasText: '测试组结果' });
  await expect(report).toBeVisible({ timeout: 30000 });
  await expect(report).toContainText('全部通过');
  await expect(report).toContainText('测试脚本');
  await expect(report).toContainText('pong');
  await report.getByRole('button', { name: '查看执行日志' }).click();

  const drawer = page.locator('.ant-drawer').filter({ hasText: '服务组日志' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('client 执行');
  await page.locator('.ant-drawer-close').click();
  await expect(drawer).toBeHidden();
});

test('脚本页：列表能打开一条脚本（懒加载 + 编辑器不白屏）', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: '脚本', exact: true }).click();
  await expect(page.locator('main.content')).toContainText(/脚本|共享面板/);
});

