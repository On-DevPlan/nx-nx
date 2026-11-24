// OpenAPI 文档（api.doc action）的对账测试。
//
// 文档是 action 声明的**投影**：每条带 http 的 action（除 stream）都该在
// paths 里出现一次；参数描述必须非空（字段描述纪律的延伸——文档里的参数
// 没有说明，等于没写文档）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { registry } = await import('../../src/runtime/registry.ts');
const { buildOpenApiDoc } = await import('../../src/modules/platform/openapi.ts');

const doc = buildOpenApiDoc(registry.actions, {
  appTitle: '测试应用',
  appDesc: '描述',
  version: '0.0.0',
});

test('文档覆盖每条带 http 的 action（stream 除外）', () => {
  const expected = registry.actions.filter((a) => a.http && !a.stream).length;
  const ops = Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).length, 0);
  assert.equal(ops, expected, '文档里的操作数与带 http 的 action 数不符');
});

test('路径参数用 OpenAPI 的 {param} 写法', () => {
  // 本模板暂无带路径参数的 action，这里守住转换规则本身
  const fake = [
    {
      id: 'x.get',
      cli: ['x', 'get'],
      http: ['GET', '/api/x/:id'],
      module: 'x',
      summary: '按 id 取',
      fields: [{ name: 'id', kind: 'string', positional: true, required: true, desc: '目标 id' }],
      input: {},
    },
  ];
  const d = buildOpenApiDoc(fake, { appTitle: 't', appDesc: 'd', version: '0' });
  assert.ok(d.paths['/api/x/{id}'], '路径参数没有转成 {param}');
  const op = d.paths['/api/x/{id}'].get;
  assert.equal(op.parameters.length, 1);
  assert.equal(op.parameters[0].in, 'path');
  assert.equal(op.parameters[0].required, true);
  assert.equal(op.parameters[0].description, '目标 id');
});

test('GET 的字段进 query 参数、非 GET 的字段进 requestBody', () => {
  const fields = [
    { name: 'a', kind: 'string', positional: false, required: true, desc: '甲' },
    { name: 'b', kind: 'number', positional: false, required: false, desc: '乙' },
  ];
  const mk = (method, http) => ({
    id: 'x.do',
    cli: ['x', 'do'],
    http: [method, http],
    module: 'x',
    summary: '做点事',
    fields,
    input: {},
  });
  const d = buildOpenApiDoc([mk('GET', '/api/x')], { appTitle: 't', appDesc: 'd', version: '0' });
  const get = d.paths['/api/x'].get;
  assert.equal(get.parameters.length, 2);
  assert.equal(get.requestBody, undefined);

  const d2 = buildOpenApiDoc([mk('POST', '/api/x')], { appTitle: 't', appDesc: 'd', version: '0' });
  const post = d2.paths['/api/x'].post;
  assert.equal(post.parameters, undefined);
  const props = post.requestBody.content['application/json'].schema.properties;
  assert.equal(props.a.description, '甲');
  assert.equal(props.b.description, '乙');
  assert.deepEqual(post.requestBody.content['application/json'].schema.required, ['a']);
});

test('每个进文档的参数都带非空描述', () => {
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      for (const p of op.parameters ?? []) {
        assert.ok(p.description, `${method} ${path} 的参数 ${p.name} 在文档里没有描述`);
      }
    }
  }
});
