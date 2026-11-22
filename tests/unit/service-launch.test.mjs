// 启动脚本（版本）解析的纯函数测试：脚本 / argv / env / 端口 / 探活必须同一口径。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { findLaunchEntry, resolveLaunch, portFromArgs, applyExplicitPort } = await import(
  '../../src/core/service/launch.js'
);
const { normalizeGroup } = await import('../../src/core/service/store.js');

const health = {
  kind: 'http',
  port: 18080,
  host: '127.0.0.1',
  path: '/ping',
  intervalMs: 5000,
  failThreshold: 3,
  readyTimeoutMs: 20000,
  onDead: 'restart',
};

const group = {
  id: 'g1',
  main: { script: 'server.mjs', args: ['--port', '18080', '--host', '127.0.0.1'] },
  health,
  launch: {
    entries: [
      {
        name: '默认',
        script: 'server.mjs',
        args: ['--port', '18080', '--config', 'config/default.json'],
        env: { NODE_ENV: 'development' },
        port: 18080,
        desc: '本机开发',
      },
      {
        name: '预发',
        args: ['--port=18081', '--config', 'config/staging.json'],
        env: { NODE_ENV: 'staging' },
        port: 18081,
      },
      {
        name: '包外',
        script: 'D:/ext/server.mjs',
        args: ['--port', '18082'],
        env: {},
        port: 18082,
      },
    ],
  },
};

test('find：按名字选中；不写名字用列表第一条；找不到时报可用版本', () => {
  assert.equal(findLaunchEntry(group, '预发')?.port, 18081);
  assert.equal(findLaunchEntry(group, '')?.name, '默认');
  assert.equal(findLaunchEntry(group, undefined)?.name, '默认');
  assert.throws(() => findLaunchEntry(group, '不存在'), /可用: 默认 \/ 预发 \/ 包外/);
  assert.equal(findLaunchEntry({ id: 'x' }, ''), undefined);
  assert.throws(() => findLaunchEntry({ id: 'x' }, '默认'), /没有启动脚本列表/);
});

test('resolve：entry 的脚本 / 参数 / 环境原样生效', () => {
  const r = resolveLaunch(group, '预发');
  assert.equal(r.entry?.name, '预发');
  assert.equal(r.script, 'server.mjs'); // 没写 script → 沿用 main
  assert.deepEqual(r.args, ['--config', 'config/staging.json', '--port', '18081']);
  assert.deepEqual(r.env, { NODE_ENV: 'staging' });
  assert.equal(r.port, 18081);
  assert.equal(r.health?.port, 18081);
});

test('resolve：entry 可以指向另一个启动脚本（含包外绝对路径）', () => {
  const r = resolveLaunch(group, '包外');
  assert.equal(r.script, 'D:/ext/server.mjs');
  assert.deepEqual(r.args, ['--port', '18082']);
  assert.equal(r.port, 18082);
});

test('resolve：没有 launch.entries 时回退 main 的脚本与参数', () => {
  const r = resolveLaunch({ id: 'plain', main: { script: 's.mjs', args: ['--port=18090'] }, health });
  assert.equal(r.entry, undefined);
  assert.equal(r.script, 's.mjs');
  assert.deepEqual(r.args, ['--port=18090']);
  assert.equal(r.port, 18090);
  assert.equal(r.health?.port, 18090);
  assert.equal(health.port, 18080, '不得就地修改原配置');
});

test('port：显式端口覆盖 argv 里的旧 --port / --port=；越界不认', () => {
  assert.deepEqual(applyExplicitPort(['s.mjs', '--port', '1', '--port=2', '--x', 'y'], 18083), [
    's.mjs',
    '--x',
    'y',
    '--port',
    '18083',
  ]);
  assert.equal(portFromArgs(['s.mjs', '--port', '70000']), undefined);
  assert.equal(portFromArgs(['s.mjs', '--port=18084', '--port', '18085']), 18085);
});

test('resolve：既无 entry 也无 main 时报明确错误', () => {
  assert.throws(() => resolveLaunch({ id: 'empty' }), /未配置主脚本/);
});

test('旧格式兼容：params + profiles 在加载时折算成完整 entries', () => {
  const cfg = normalizeGroup(
    {
      name: 'legacy',
      main: { script: 's.mjs', args: ['--port', '18080'] },
      health: { ...health, port: 18080 },
      launch: {
        params: [
          { key: 'port', type: 'number', default: '18080', arg: 'port' },
          { key: 'env', type: 'select', options: ['development', 'staging'], env: 'NODE_ENV' },
          { key: 'config', type: 'text', default: 'config/default.json', arg: 'config' },
        ],
        profiles: [
          { name: '默认', values: { port: '18080', env: 'development', config: 'config/default.json' } },
          { name: '预发', values: { port: '18081', env: 'staging', config: 'config/staging.json' } },
        ],
      },
    },
    'legacy',
  );
  assert.deepEqual(cfg.launch?.entries.map((e) => e.name), ['默认', '预发']);
  assert.deepEqual(cfg.launch?.entries[1]?.args, [
    '--port',
    '18081',
    '--config',
    'config/staging.json',
  ]);
  assert.deepEqual(cfg.launch?.entries[1]?.env, { NODE_ENV: 'staging' });
  assert.equal(cfg.launch?.entries[1]?.port, 18081);
});
