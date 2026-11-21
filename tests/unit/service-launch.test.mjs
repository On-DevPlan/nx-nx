// 启动版本参数的纯函数测试：端口 / 配置文件 / 环境变量三件事必须口径一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeLaunchValues,
  applyLaunchArgs,
  launchEnv,
  launchPort,
  effectiveHealth,
} = await import('../../src/core/service/launch.js');

const group = {
  id: 'g1',
  launch: {
    params: [
      { key: 'port', label: '端口', type: 'number', default: '18080', arg: 'port' },
      { key: 'env', label: '环境', type: 'select', options: ['development', 'staging'], default: 'development', env: 'NODE_ENV' },
      { key: 'config', label: '配置', type: 'text', default: 'config/default.json', arg: 'config' },
    ],
  },
  health: { kind: 'http', port: 18080, host: '127.0.0.1', path: '/ping', intervalMs: 5000, failThreshold: 3, readyTimeoutMs: 20000, onDead: 'restart' },
};

test('normalize：补默认值，丢弃未声明键', () => {
  const v = normalizeLaunchValues(group, { port: '18081', hacked: 'x' });
  assert.equal(v.port, '18081');
  assert.equal(v.env, 'development');
  assert.equal(v.config, 'config/default.json');
  assert.equal('hacked' in v, false);
});

test('argv：已有 --port 被替换（旧值删掉，新 flag 追加），新 flag 也追加', () => {
  const base = ['server.mjs', '--port', '18080', '--host', '127.0.0.1'];
  const args = applyLaunchArgs(group, base, { port: '18081', config: 'config/staging.json' });
  assert.deepEqual(args, [
    'server.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    '18081',
    '--config',
    'config/staging.json',
  ]);
});

test('argv：等号写法的旧 flag 也会被删掉，缺省参数按默认值补上', () => {
  const args = applyLaunchArgs(group, ['s.mjs', '--port=18080'], { port: '18082' });
  assert.deepEqual(args, ['s.mjs', '--port', '18082', '--config', 'config/default.json']);
});

test('env：只注入声明过且有值的变量', () => {
  assert.deepEqual(launchEnv(group, { env: 'staging' }), { NODE_ENV: 'staging' });
  assert.deepEqual(launchEnv(group, { env: '' }), {});
});

test('port：key 或 arg 叫 port 才认；越界回落 undefined', () => {
  assert.equal(launchPort(group, { port: '18081' }), 18081);
  assert.equal(launchPort(group, { port: '70000' }), undefined);
  assert.equal(launchPort({ id: 'x' }, { port: '18081' }), undefined);
});

test('health 跟随启动端口，不就地改原配置', () => {
  const h = effectiveHealth(group, { port: '18081' });
  assert.equal(h.port, 18081);
  assert.equal(group.health.port, 18080);
  assert.equal(effectiveHealth({ id: 'no-health' }, { port: '1' }), undefined);
});
