// action 的 zod 契约：flags/args 负责命令行表面，schema 负责值的合法性。
//
// 这两层必须一起测：只测 zod 等于没测「CLI 字符串怎么变成数字」，
// 只测 flags 等于没测「非法值有没有在 handler 之前被拦住」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const { applySpec } = await import('../../src/runtime/spec.js');
const { default: serviceGroup } = await import('../../src/modules/service-group/index.js');

const actionOf = (id) => {
  const a = serviceGroup.actions.find((x) => x.id === id);
  assert.ok(a, `找不到 action ${id}`);
  return a;
};

const initAction = {
  id: 'demo.init',
  cli: ['demo', 'init'],
  args: ['id'],
  flags: {
    port: { type: 'number' },
    name: { type: 'string' },
  },
  schema: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'id 非法'),
    port: z.coerce.number().int().min(1).max(65535),
    name: z.string().trim().min(1).default('未命名'),
  }),
};

test('schema：flags 先把字符串强转成数字，schema 再校验范围', () => {
  const out = applySpec(initAction, { id: 'demo-svc', port: '18080', name: '  我的服务  ' });
  assert.equal(out.port, 18080, 'CLI 的 "18080" 应当先变成 number');
  assert.equal(out.name, '我的服务', 'schema 的 trim 应当生效');
});

test('schema：schema 默认值补上 flags 没给的字段', () => {
  const out = applySpec(initAction, { id: 'a', port: '1' });
  assert.equal(out.name, '未命名');
});

test('schema：非法值在 handler 之前被拦住，错误带「用法:」与字段路径', () => {
  assert.throws(
    () => applySpec(initAction, { id: 'Bad_Id', port: '99999' }),
    (err) => {
      const msg = String(err?.message || err);
      assert.match(msg, /用法: /, '必须复用统一的输入错误出口');
      assert.match(msg, /id: id 非法/, '错误消息应带字段路径');
      assert.match(msg, /port: /);
      return true;
    },
  );
});

test('没有 schema 的 action：保持原行为（未声明字段原样透传）', () => {
  const plain = { id: 'demo.plain', cli: ['demo'], flags: { dry: { type: 'boolean' } } };
  const out = applySpec(plain, { dry: 'false', extra: 'keep' });
  assert.equal(out.dry, false);
  assert.equal(out.extra, 'keep');
});

test('真实模块：sg stop 的 mode 枚举与 id 正则都在 handler 前被拦住', () => {
  const stop = actionOf('serviceGroup.stop');
  assert.throws(
    () => applySpec(stop, { id: 'Bad_Id', mode: 'kill' }),
    (err) => {
      const msg = String(err?.message || err);
      assert.match(msg, /用法: /);
      assert.match(msg, /id: /, 'id 正则应报错');
      assert.match(msg, /mode: /, 'mode 枚举应报错');
      return true;
    },
  );
});

test('真实模块：sg space-call 的 --args 必须是 JSON 数组', () => {
  const call = actionOf('serviceGroup.spaceCall');
  assert.throws(
    () => applySpec(call, { id: 'ping-demo', method: 'checkUp', args: '{"a":1}' }),
    /args: --args 必须是 JSON 数组/,
  );
  const out = applySpec(call, { id: 'ping-demo', method: 'checkUp', args: '["x"]' });
  assert.equal(out.args, '["x"]', '合法 JSON 数组应原样通过，交给 handler 再 parse');
});
