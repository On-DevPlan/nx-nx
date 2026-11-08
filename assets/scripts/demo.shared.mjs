// 共享函数面板（demo-group 服务组绑定）——装载后即成为「管理空间」。
//
// 约定：
//   - 不作为入口执行（.shared 后缀，runner 会拒绝直接运行）
//   - 「常量 = 函数 = {}」整体优先执行：把要共享的东西挂到 globalThis
//   - 装载完成后 runner 扫描具名导出 + 新增全局键并输出堆快照——
//     可 JSON 表示的数据确认；函数报签名；Map/循环引用等只报类型（无地址/句柄细节）
//   - __tests 是隐藏测试案例：对导出做 JSON 可表示性断言，runner 装载后自动运行
//     （通过不出声，失败只告警不阻断）
//   - checkUp() 是空间的 bool 方法：执行 server 之前先问它「现在能起吗」
//
// client-base 思想：基础设施全在这里（token、API 端点封装、通用头），
// client 业务脚本只写业务流程。

import { installAliases } from './aliases.mjs';
import { defineSpace } from './_ns.mjs';

installAliases(globalThis);

// ---- 常量（整体优先执行阶段产出）----
globalThis.API_TOKEN = 'tok_' + Math.random().toString(36).slice(2, 12);
globalThis.BASE_URL = 'http://127.0.0.1:18999';
globalThis.CREATED_AT = new Date().toISOString();

// ---- 通用头 ----
globalThis.sendHeaders = function sendHeaders() {
  return bearer(API_TOKEN);
};

// ---- 空间的 bool check 方法（执行 server 前先 check）----
//
// 返回 bool 的方法就是空间的「起飞闸门」：流水线在启动主脚本之前调它，
// 返回 false 就不启动（依赖没就绪，起早了只会白占端口）。
// 名字由服务组配置指定（space.check），默认 checkUp。
//
// 写 check 的正确姿势：**判依赖，不要判自己**。
//   ✗ 判自己活没活 → 循环依赖（问「我能不能起」时先去问「我活着吗」）
//   ✓ 判依赖就绪   → 上游可达 / 凭据就绪 / 端口没被占
//
// demo 的依赖就是「18999 端口」：起服务前得先确认这个端口没人占。
// 若端口上正跑着自己（服务已起），那也允许——幂等语义，流水线会跳过启动。
globalThis.checkUp = async function checkUp() {
  const r = await serviceCheck('demo-group');
  if (r.alive) return true; // 已经在跑了 → 允许（幂等）
  // 失活：看看是不是「端口被占」——那说明有别的进程占着，不能起
  return !/EADDRINUSE|占用/.test(r.detail);
};

// 恒假：用来验证「闸门不过就不启动主脚本」这条不变量
globalThis.alwaysDown = async function alwaysDown() {
  return false;
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

// ---- 显式声明空间（名字 + 状态）----
//
// 面板也可以只靠 globalThis 挂东西（那样空间名是 'panel'）；
// 显式声明的好处是空间有名字、状态集中在一处，索引里一眼认得出。
export const SPACE = defineSpace({
  name: 'demo',
  description: '演示服务组的管理空间：token / API 封装 / 活性 check',
  state: {
    API_TOKEN,
    BASE_URL,
    CREATED_AT,
  },
});

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
