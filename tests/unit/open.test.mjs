// system.open 的目标归一（normalizeOpenTarget）测试。
//
// 浏览器打开是副作用，不进测试；这里钉住的是「用户敲的字符串 → 打开哪个 URL」
// 的全部规则，以及探针语义（只有本机目标才返回端口供探测）。
// 反面教材：纯端口若不先行截住，拼上 scheme 会被 URL 解析成数字主机名——
// 「7822」打开的是 http://7822/ 而不是 http://localhost:7822。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenTarget } from '../../src/modules/system/index.js';

test('open: 纯端口 → localhost，可带路径', () => {
  assert.deepEqual(normalizeOpenTarget('7822'), { url: 'http://localhost:7822', port: 7822 });
  assert.deepEqual(normalizeOpenTarget('7822/api'), { url: 'http://localhost:7822/api', port: 7822 });
});

test('open: host:port 与完整 URL', () => {
  assert.deepEqual(normalizeOpenTarget('localhost:7822'), { url: 'http://localhost:7822/', port: 7822 });
  assert.deepEqual(normalizeOpenTarget('127.0.0.1:3000/x'), { url: 'http://127.0.0.1:3000/x', port: 3000 });
  assert.deepEqual(normalizeOpenTarget('[::1]:7822'), { url: 'http://[::1]:7822/', port: 7822 });
  assert.deepEqual(normalizeOpenTarget('https://example.com'), { url: 'https://example.com/', port: null });
  // 非本机地址不返回端口：probePort 只探本机，对外部地址探测是误导
  assert.deepEqual(normalizeOpenTarget('http://192.168.1.5:7822'), {
    url: 'http://192.168.1.5:7822/',
    port: null,
  });
});

test('open: 端口带路径的完整 URL 原样保留路径', () => {
  assert.deepEqual(normalizeOpenTarget('http://localhost:7822/web/a?b=1'), {
    url: 'http://localhost:7822/web/a?b=1',
    port: 7822,
  });
});

test('open: 非法输入当场拒（含全数字主机名的常见误写）', () => {
  assert.throws(() => normalizeOpenTarget(''), /需要一个目标/);
  assert.throws(() => normalizeOpenTarget('   '), /需要一个目标/);
  assert.throws(() => normalizeOpenTarget('0'), /越界/);
  assert.throws(() => normalizeOpenTarget('70000'), /越界/);
  assert.throws(() => normalizeOpenTarget('7822:80'), /数字主机名/);
  assert.throws(() => normalizeOpenTarget('http://'), /打不开/);
});
