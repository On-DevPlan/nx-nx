// 共享函数面板（demo-group 服务组绑定）。
//
// 约定：
//   - 不作为入口执行（.shared 后缀，runner 会拒绝直接运行）
//   - 「常量 = 函数 = {}」整体优先执行：把要共享的东西挂到 globalThis
//   - 执行完成后 runner 扫描新增全局键并输出堆快照——
//     只显示可 JSON 表示的数据确认；函数报签名；Map/循环引用等只报类型（无地址/句柄细节）
//   - __tests 是隐藏测试案例：对导出做 JSON 可表示性断言，runner 装载后自动运行

import { installAliases } from './aliases.mjs';

installAliases(globalThis);

// ---- 常量（整体优先执行阶段产出）----
globalThis.API_TOKEN = 'tok_' + Math.random().toString(36).slice(2, 12);
globalThis.BASE_URL = 'http://127.0.0.1:18999';
globalThis.CREATED_AT = new Date().toISOString();

// ---- 函数 ----
globalThis.makeUsers = function makeUsers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: 'user_' + Math.random().toString(36).slice(2, 8),
    tag: API_TOKEN.slice(0, 6),
  }));
};

globalThis.sendHeaders = function sendHeaders() {
  return { authorization: `Bearer ${API_TOKEN}` };
};

// 服务组活性 check：调 nx-nx serve 的 API（端口从环境注入），返回 bool
globalThis.serviceAlive = async function serviceAlive(groupId) {
  const port = env('NX_NX_SERVE_PORT', '7880');
  try {
    const r = await httpGet(`http://127.0.0.1:${port}/api/service-groups/${groupId}/alive`);
    return r.json?.alive === true;
  } catch {
    return false;
  }
};

// 故意放一个非 JSON 可表示的东西：验证堆快照的「清理」行为（只报类型，不报内部）
globalThis._internalCache = new Map([['session', 'should-not-leak']]);

// ---- 隐藏测试案例（runner 自动执行，失败只告警不阻断）----
globalThis.__tests = {
  'token 可 JSON 表示': () => JSON.stringify(API_TOKEN).length > 8,
  'makeUsers 返回数组': () => Array.isArray(makeUsers(1)),
  '_internalCache 不可 JSON 表示（预期）': () => {
    try {
      JSON.stringify(_internalCache);
      return false; // Map 能 stringify 出 {}，也算可表示——这里断言它至少不抛错
    } catch {
      return true;
    }
  },
};
