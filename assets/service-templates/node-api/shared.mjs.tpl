// {{ID}} 的共享面板：常量 = 函数 = {} 整体优先执行。
//
// client-base 思想：基础设施（token、通用头、API 封装）全在这里，
// client 脚本只写业务流程。装载后它就是这个服务组的管理空间：
//   - API_TOKEN / BASE_URL / sendHeaders 在整体优先执行阶段产出
//   - checkUp() 是空间的 bool 方法：启动主脚本之前先问它「现在能起吗」
//
// 约定：.shared 后缀不是入口，不能直接运行；组内脚本执行前自动装载。
import { installAliases } from './aliases.mjs';
import { defineSpace } from './_ns.mjs';

installAliases(globalThis);

// ---- 常量（每次装载重新生成）----
globalThis.API_TOKEN = 'tok_' + Math.random().toString(36).slice(2, 12);
globalThis.BASE_URL = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || {{PORT}});
globalThis.CREATED_AT = new Date().toISOString();

// ---- 通用头 ----
globalThis.sendHeaders = function sendHeaders() {
  return bearer(API_TOKEN);
};

// ---- 起飞闸门：判依赖，不要判自己 ----
globalThis.checkUp = async function checkUp() {
  const r = await serviceCheck('{{ID}}');
  if (r.alive) return true; // 已经在跑 → 幂等放行
  return !/EADDRINUSE|占用/.test(r.detail); // 端口被别的进程占着 → 不许起
};

// ---- 业务 API 封装（扩展接口时只需记住这些签名）----
globalThis.api = {
  getCustomers: function getCustomers({ page = 1, size = 20, keyword = '' } = {}) {
    return send({
      method: 'GET',
      url: BASE_URL + '/api/customers',
      headers: sendHeaders(),
      qs: { page, size, keyword },
      label: 'getCustomers',
    });
  },
  createCustomer: function createCustomer({ name, phone = '13800000000', level = 'normal' }) {
    return send({
      method: 'POST',
      url: BASE_URL + '/api/customers',
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
    token: API_TOKEN.slice(0, 6),
  }));
};

// ---- 空间声明：名字 + 状态 ----
export const SPACE = defineSpace({
  name: '{{ID}}',
  description: '{{ID}} 的管理空间：token / API 封装 / 起飞闸门',
  state: { API_TOKEN, BASE_URL, CREATED_AT },
});

// ---- 隐藏测试案例（装载后自动跑，失败只告警不阻断）----
globalThis.__tests = {
  'token 可 JSON 表示': () => JSON.stringify(API_TOKEN).length > 8,
  'api.getCustomers 是函数': () => typeof api.getCustomers === 'function',
  'makeUsers 返回数组': () => Array.isArray(makeUsers(1)),
};
