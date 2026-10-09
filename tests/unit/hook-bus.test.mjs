// 通用 hook 总线的单元测试：配置加载、match、handler 协议、阻断、聚合、
// 无限事件平面与错误处理。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHookConfig, runHookEvent } from '../../src/core/skills/bus.ts';

function dir() {
  return mkdtempSync(join(tmpdir(), 'hookbus-'));
}

function writeConfig(root, cfg) {
  writeFileSync(join(root, 'hooks.json'), JSON.stringify(cfg));
}

test('无 hooks.json → null（无钩子）', async () => {
  const root = dir();
  assert.equal(await loadHookConfig(root), null);
});

test('match：命中才执行；不命中跳过', async () => {
  const root = dir();
  writeFileSync(join(root, 'hit.mjs'), 'export default () => ({ data: "ran" });');
  writeConfig(root, {
    version: 1,
    hooks: {
      'demo:event': [
        { match: '^alpha$', hooks: [{ type: 'module', use: './hit.mjs' }] },
      ],
    },
  });
  const config = await loadHookConfig(root);

  const miss = await runHookEvent({ event: 'demo:event', target: 'beta', configs: [config] });
  assert.equal(miss.ran, 0);

  const hit = await runHookEvent({ event: 'demo:event', target: 'alpha', configs: [config] });
  assert.equal(hit.ran, 1);
  assert.deepEqual(hit.data, ['ran']);
});

test('多 handler 顺序执行，vars 聚合', async () => {
  const root = dir();
  writeFileSync(join(root, 'a.mjs'), 'export default () => ({ vars: { A: "1" } });');
  writeFileSync(join(root, 'b.mjs'), 'export default () => ({ vars: { B: "2" } });');
  writeConfig(root, {
    version: 1,
    hooks: {
      'demo:vars': [
        { match: '.*', hooks: [
          { type: 'module', use: './a.mjs' },
          { type: 'module', use: './b.mjs' },
        ] },
      ],
    },
  });
  const config = await loadHookConfig(root);
  const out = await runHookEvent({ event: 'demo:vars', target: 'x', configs: [config] });
  assert.equal(out.ran, 2);
  assert.deepEqual(out.vars, { A: '1', B: '2' });
});

test('block：立即阻断，后续 handler 不执行', async () => {
  const root = dir();
  writeFileSync(join(root, 'block.mjs'), 'export default () => ({ block: "nope" });');
  writeFileSync(join(root, 'after.mjs'), 'export default () => ({ data: "should-not-run" });');
  writeConfig(root, {
    version: 1,
    hooks: {
      'demo:block': [
        { match: '.*', hooks: [
          { type: 'module', use: './block.mjs' },
          { type: 'module', use: './after.mjs' },
        ] },
      ],
    },
  });
  const config = await loadHookConfig(root);
  const out = await runHookEvent({ event: 'demo:block', target: 'x', configs: [config] });
  assert.equal(out.blocked, true);
  assert.equal(out.reason, 'nope');
  assert.equal(out.ran, 1);
  assert.deepEqual(out.data, []);
});

test('无限事件平面：任意自定义事件名可触发', async () => {
  const root = dir();
  writeFileSync(join(root, 'p.mjs'), 'export default (p) => ({ data: p.event });');
  writeConfig(root, {
    version: 1,
    hooks: {
      'acme:custom:plane': [
        { match: 't-\\d+', hooks: [{ type: 'module', use: './p.mjs' }] },
      ],
    },
  });
  const config = await loadHookConfig(root);
  const out = await runHookEvent({
    event: 'acme:custom:plane',
    target: 't-42',
    configs: [config],
  });
  assert.equal(out.ran, 1);
  assert.deepEqual(out.data, ['acme:custom:plane']);
});

test('command handler：exit 2 → block（stderr 为原因）', async () => {
  const root = dir();
  const command =
    process.platform === 'win32'
      ? 'node -e "console.error(\'from-stderr\'); process.exit(2)"'
      : "node -e \"console.error('from-stderr'); process.exit(2)\"";
  writeConfig(root, {
    version: 1,
    hooks: {
      'demo:cmd': [
        { match: '.*', hooks: [{ type: 'command', command }] },
      ],
    },
  });
  const config = await loadHookConfig(root);
  const out = await runHookEvent({ event: 'demo:cmd', target: 'x', configs: [config] });
  assert.equal(out.blocked, true);
  assert.match(out.reason, /from-stderr/);
});

test('command handler：exit 0 + stdout JSON → decision vars', async () => {
  const root = dir();
  const command =
    process.platform === 'win32'
      ? 'node -e "process.stdout.write(JSON.stringify({vars:{Q:\'v\'}}))"'
      : "node -e \"process.stdout.write(JSON.stringify({vars:{Q:'v'}}))\"";
  writeConfig(root, {
    version: 1,
    hooks: {
      'demo:cmdok': [
        { match: '.*', hooks: [{ type: 'command', command }] },
      ],
    },
  });
  const config = await loadHookConfig(root);
  const out = await runHookEvent({ event: 'demo:cmdok', target: 'x', configs: [config] });
  assert.equal(out.ran, 1);
  assert.deepEqual(out.vars, { Q: 'v' });
});

test('module 路径越界（..）被拒绝', async () => {
  const root = dir();
  const sub = join(root, 'sub');
  mkdirSync(sub, { recursive: true });
  writeConfig(sub, {
    version: 1,
    hooks: {
      'demo:escape': [
        { match: '.*', hooks: [{ type: 'module', use: '../outside.mjs' }] },
      ],
    },
  });
  const config = await loadHookConfig(sub);
  await assert.rejects(
    () => runHookEvent({ event: 'demo:escape', target: 'x', configs: [config] }),
    /越出配置目录/
  );
});

test('坏配置：坏 JSON / 非法 match 正则 / 缺 hooks 均显眼报错', async () => {
  const root1 = dir();
  writeFileSync(join(root1, 'hooks.json'), '{ broken');
  await assert.rejects(() => loadHookConfig(root1), /合法 JSON/);

  const root2 = dir();
  writeConfig(root2, { version: 1, hooks: { e: [{ match: '([', hooks: [] }] } });
  await assert.rejects(() => loadHookConfig(root2), /合法正则|hooks 数组|schema/);

  const root3 = dir();
  writeConfig(root3, { version: 1, hooks: {} });
  const cfg = await loadHookConfig(root3);
  assert.equal(cfg.hooks.e, undefined);
});
