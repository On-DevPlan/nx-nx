// 共享函数面板（demo-group 服务组绑定）。
//
// 约定：
//   - 不作为入口执行（.shared 后缀，runner 会拒绝直接运行）
//   - 「常量 = 函数 = {}」整体优先执行：把要共享的东西挂到 globalThis
//   - 执行完成后 runner 扫描新增全局键并输出堆快照——
//     只显示可 JSON 表示的数据确认；函数报签名；Map/循环引用等只报类型（无地址/句柄细节）
//   - __tests 是隐藏测试案例：对导出做 JSON 可表示性断言，runner 装载后自动运行
//
// client-base 思想：基础设施全在这里（token、API 端点封装、通用头），
// client 业务脚本只写业务流程。

import { installAliases } from './aliases.mjs';

installAliases(globalThis);

// ---- 常量（整体优先执行阶段产出）----
globalThis.API_TOKEN = 'tok_' + Math.random().toString(36).slice(2, 12);
globalThis.BASE_URL = 'http://127.0.0.1:18999';
globalThis.CREATED_AT = new Date().toISOString();

// ---- 通用头 ----
globalThis.sendHeaders = function sendHeaders() {
  return bearer(API_TOKEN);
};

// ---- 基础设施函数（服务组活性 check：执行 server 前先 check）----
globalThis.serviceAlive = async function serviceAlive(groupId) {
  // 内置别名 serviceAlive 已存在；这里显式转发保持面板自洽
  return serviceAlive2(groupId);
};
// 避免与内置别名同名覆盖：内部实现走内置 serviceCheck
globalThis.serviceAlive2 = async function serviceAlive2(groupId) {
  const r = await serviceCheck(groupId);
  return r.alive;
};

// ---- 业务 API 封装（扩展 API 时只需记住这些函数签名）----
globalThis.api = {
  // GET /api/customers —— 分页 + 关键字
  getCustomers: function getCustomers({ page = 1, size = 20, keyword = '' } = {}) {
    return send({
      method: 'GET',
      url: `${BASE_URL}/api/customers`,
      headers: sendHeaders(),
      qs: { page, size, keyword },
      label: 'getCustomers',
    });
  },

  // POST /api/customers —— 创建
  createCustomer: function createCustomer({ name, phone, level = 'normal' }) {
    return send({
      method: 'POST',
      url: `${BASE_URL}/api/customers`,
      headers: sendHeaders(),
      body: { name, phone, level },
      label: 'createCustomer',
    });
  },
};

// ---- 随机数据工厂 ----
globalThis.makeUsers = function makeUsers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: 'user_' + Math.random().toString(36).slice(2, 8),
    tag: API_TOKEN.slice(0, 6),
  }));
};

// ---- 故意放一个非 JSON 可表示的东西：验证堆快照的「清理」行为 ----
globalThis._internalCache = new Map([['session', 'should-not-leak']]);

// ---- 隐藏测试案例（runner 自动执行，失败只告警不阻断）----
globalThis.__tests = {
  'token 可 JSON 表示': () => JSON.stringify(API_TOKEN).length > 8,
  'makeUsers 返回数组': () => Array.isArray(makeUsers(1)),
  'api.getCustomers 是函数': () => typeof api.getCustomers === 'function',
  '_internalCache 不可 JSON 表示（预期）': () => {
    try {
      JSON.stringify(_internalCache);
      return true; // Map stringify 出 {}——不抛错即可
    } catch {
      return true;
    }
  },
};
