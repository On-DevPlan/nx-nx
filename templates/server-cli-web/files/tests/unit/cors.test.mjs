// CORS 策略的单元测试（runtime/cors.ts）。
//
// 关键语义三条：
//   1. 非浏览器客户端（无 Origin）不受影响，照常放行；
//   2. 来源不在名单里 → **不加** allow-origin 头（让浏览器自己拦），
//      而不是服务端回 403（那会把「跨源不支持」和「请求出错」混成一种状态码）；
//   3. 预检（OPTIONS + Access-Control-Request-Method）→ 204 + 回显请求头。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  parseAllowOrigin,
  originAllowed,
  isPreflight,
  corsHeaders,
  preflightHeaders,
} = await import('../../src/runtime/cors.ts');

test('parseAllowOrigin：缺省 / * / 名单 / 混合', () => {
  assert.deepEqual(parseAllowOrigin(undefined), { all: true, list: [] });
  assert.deepEqual(parseAllowOrigin('*'), { all: true, list: [] });
  assert.deepEqual(parseAllowOrigin(''), { all: true, list: [] });
  assert.deepEqual(parseAllowOrigin('https://a.com, https://b.com/'), {
    all: false,
    list: ['https://a.com', 'https://b.com'],
  });
  // 名单里带 * = 放行全部
  assert.deepEqual(parseAllowOrigin('https://a.com,*'), { all: true, list: [] });
});

test('originAllowed：精确、通配与恶意后缀反例', () => {
  const allow = parseAllowOrigin('https://good.example.com,https://*.example.org');
  assert.equal(originAllowed('https://good.example.com', allow), true);
  assert.equal(originAllowed('https://sub.example.org', allow), true);
  assert.equal(originAllowed('https://evil.com', allow), false);
  // 恶意后缀（good.example.com.evil.com）不该被通配符命中
  assert.equal(originAllowed('https://good.example.com.evil.com', allow), false);
  // 通配首段必须贴在开头
  assert.equal(originAllowed('https://x.example.org.evil.com', allow), false);
});

test('corsHeaders：无 Origin 不加 allow-origin；名单外不加；放行时给值', () => {
  const allow = parseAllowOrigin('https://good.example.com');
  const noOrigin = corsHeaders({ headers: {} }, allow);
  assert.equal(noOrigin['access-control-allow-origin'], undefined);
  assert.equal(noOrigin.vary, 'Origin');

  const blocked = corsHeaders({ headers: { origin: 'https://evil.com' } }, allow);
  assert.equal(blocked['access-control-allow-origin'], undefined);

  const ok = corsHeaders({ headers: { origin: 'https://good.example.com' } }, allow);
  assert.equal(ok['access-control-allow-origin'], 'https://good.example.com');

  // 放行全部时给 *
  const all = corsHeaders({ headers: { origin: 'https://any.com' } }, parseAllowOrigin(undefined));
  assert.equal(all['access-control-allow-origin'], '*');
});

test('isPreflight：OPTIONS + access-control-request-method', () => {
  assert.equal(isPreflight({ method: 'OPTIONS', headers: { 'access-control-request-method': 'PATCH' } }), true);
  assert.equal(isPreflight({ method: 'OPTIONS', headers: {} }), false);
  assert.equal(isPreflight({ method: 'GET', headers: { 'access-control-request-method': 'GET' } }), false);
});

test('preflightHeaders：回显本次请求的方法与请求头，带 max-age', () => {
  const allow = parseAllowOrigin(undefined);
  const h = preflightHeaders(
    {
      method: 'OPTIONS',
      headers: {
        origin: 'https://any.com',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type,x-custom',
      },
    },
    allow,
  );
  assert.equal(h['access-control-allow-origin'], '*');
  assert.ok(h['access-control-allow-methods'].includes('PATCH'));
  assert.equal(h['access-control-allow-headers'], 'content-type,x-custom');
  assert.equal(h['access-control-max-age'], '600');
});
