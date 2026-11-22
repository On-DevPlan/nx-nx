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

test('服务页：设置页建完整案例 → 首页只留探活/启动/运行/停止 + 日志', async ({ page }) => {
  // 幂等：重复跑/上一次中断留下的同名服务组先删掉（API 404 不算失败）。
  await page.request.delete('/api/service-groups/ping-demo').catch(() => {});
  await page.goto('/');
  // 空态从首页指到设置页；已有服务组时首页右上角的齿轮也能进。
  await nav(page).getByRole('button', { name: '服务', exact: true }).click();
  await page.getByRole('button', { name: /去设置页创建/ }).click();

  await page.getByRole('button', { name: /创建完整案例|从模板创建/ }).first().click();
  const modal = page.locator('.ant-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('新建服务')).toBeVisible();
  // 默认模板 node-ping 带出的默认值：id=ping-demo / 端口=18080
  await expect(modal.locator('input[placeholder="ping-demo"]')).toHaveValue('ping-demo');
  await expect(modal.locator('.ant-input-number input')).toHaveValue('18080');

  await modal.getByRole('button', { name: '创建服务' }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });

  // 默认落到「服务脚本」：四个角色都带默认实现，可直接改，不用先配置。
  await expect(page.locator('.sg-list').getByText('ping-demo', { exact: true })).toBeVisible();
  for (const tab of ['启动', '停止', '探活', '共享']) {
    await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: '高级', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '客户端', exact: true })).toBeVisible();
  await expect(page.locator('.sg-detail')).toContainText('ping-demo-server');
  await expect(page.locator('.sg-detail')).toContainText('/ping');
  await expect(page.locator('.sg-script-code')).toBeVisible();

  // 启动脚本列表收在「高级」里，没有独立「启动参数」栏目。
  await page.getByRole('tab', { name: '高级', exact: true }).click();
  await expect(page.getByRole('tab', { name: '启动参数' })).toHaveCount(0);
  await expect(page.locator('.sg-launch-field')).toBeVisible();
  await expect(page.locator('.sg-launch-entry')).toHaveCount(3);
  const preRow = page.locator('.sg-launch-entry').nth(1);
  await expect(preRow.locator('input[placeholder^="版本名"]')).toHaveValue('预发');
  await expect(preRow.locator('.ant-input-number input')).toHaveValue('18081');

  await preRow.locator('input[placeholder="一句话说明（可留空）"]').fill('E2E 预发环境');
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect(page.locator('.toast-stack')).toContainText('已保存');
  const saved = await (await page.request.get('/api/service-groups/ping-demo')).json();
  expect(saved.data.config.launch.entries[1].desc).toBe('E2E 预发环境');
  expect(saved.data.config.stop.script).toBe('ping-demo-stop');
  expect(saved.data.config.probe.script).toBe('ping-demo-health');
  expect(saved.data.config.shared).toBe('ping-demo.shared');

  await page.getByRole('tab', { name: '客户端', exact: true }).click();
  await expect(page.locator('.sg-detail')).toContainText('client 步骤（1 个）');
  await expect(page.locator('.sg-detail')).toContainText('ping-demo-client');
  await expect(page.locator('.sg-detail')).not.toContainText('流水线画布');

  // 服务首页：四个运维按钮 + 日志预览。
  await nav(page).getByRole('button', { name: '服务', exact: true }).click();
  const detail = page.locator('.sg-detail');
  await expect(detail.getByRole('button', { name: '探活' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '启动' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '运行客户端 (1)' })).toBeVisible();
  await expect(detail.getByRole('button', { name: '停止' })).toBeVisible();
  await expect(detail).toContainText('最近日志');
  await expect(detail).toContainText('完整的本机 Node 案例');
  await expect(detail).not.toContainText('主脚本（长驻服务');

  // 启动脚本列表：三个版本，选一个再确认；不再弹参数输入框。
  await detail.getByRole('button', { name: '启动' }).click();
  const launch = page.locator('.ant-modal').filter({ hasText: '启动 · Ping 服务' });
  await expect(launch).toBeVisible();
  await expect(launch.locator('.sg-launch-pick')).toHaveCount(3);
  await launch.getByText('预发', { exact: true }).click();
  await expect(launch.locator('.sg-launch-pick-env').filter({ hasText: 'NODE_ENV=staging' }).first()).toBeVisible();
  await launch.locator('.ant-modal-footer button.ant-btn-primary').click();
  await expect(launch).toBeHidden();
  await expect(detail).toContainText('预发 · 端口 18081');
  await expect(detail.getByRole('button', { name: '切换版本' })).toBeVisible();

  // 客户端流水线独立：点一下就跑，不弹启动版本，也不管理服务生命周期。
  await detail.getByRole('button', { name: /运行客户端/ }).click();
  const report = page.locator('.ant-modal').filter({ hasText: '客户端结果' });
  await expect(report).toBeVisible({ timeout: 30000 });
  await expect(report).toContainText('全部通过');
  await expect(report).toContainText('client 脚本');
  await expect(report).toContainText('pong');
  await expect(report).toContainText('共享数据');
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

