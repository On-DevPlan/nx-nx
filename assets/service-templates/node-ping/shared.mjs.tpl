// {{ID}} 的共享面板：常量 = 函数 = {} 整体优先执行。
//
// 装载后它就是这个服务组的「管理空间」：
//   - BASE_URL 等常量在这里产出（client 脚本直接用，不用各写一份）
//   - checkUp() 是空间的 bool 方法：启动主脚本之前先问它「现在能起吗」
//
// 约定（与模板一起给出的默认答案）：
//   - .shared 后缀不是入口，runner 会拒绝直接执行；组内脚本执行前自动装载
//   - 装载完成后输出变量堆快照（只显示可 JSON 表示的数据确认）
//   - __tests 是隐藏测试案例：装载后自动跑，失败只告警不阻断
import { installAliases } from './aliases.mjs';
import { defineSpace } from './_ns.mjs';

installAliases(globalThis);

// ---- 常量（整体优先执行阶段产出）----
// 启动参数可能改端口：优先用运行环境注入的实际 URL / 端口，模板默认值只作兜底。
globalThis.BASE_URL = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || {{PORT}});
globalThis.CREATED_AT = new Date().toISOString();

// ---- 起飞闸门：返回 true 才允许启动主脚本 ----
//
// 写 check 的正确姿势是「判依赖，不要判自己」：
//   ✓ 服务已经在跑 → 允许（幂等，流水线会跳过重复启动）
//   ✓ 服务没跑、端口也没被别的进程占 → 允许
//   ✗ 端口被别的进程占着 → 不许起（起了也只会 EADDRINUSE）
globalThis.checkUp = async function checkUp() {
  const r = await serviceCheck('{{ID}}');
  if (r.alive) return true;
  return !/EADDRINUSE|占用/.test(r.detail);
};

// 恒假：验证「闸门不过就不启动主脚本」这条不变量时可以临时换上
globalThis.alwaysDown = async function alwaysDown() {
  return false;
};

// ---- 显式声明空间（名字 + 状态，索引里一眼认得出）----
export const SPACE = defineSpace({
  name: '{{ID}}',
  description: '{{ID}} 的管理空间：BASE_URL + 起飞闸门',
  state: { BASE_URL, CREATED_AT },
});

// ---- 隐藏测试案例（装载后自动执行，失败只告警不阻断）----
globalThis.__tests = {
  'BASE_URL 指向本机': () => BASE_URL.startsWith('http://127.0.0.1:'),
  'checkUp 是函数': () => typeof checkUp === 'function',
};
