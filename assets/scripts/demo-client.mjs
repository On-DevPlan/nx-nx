// 演示：client 脚本（服务组的次脚本）。
// 业务请求单独一个文件——基础设施全部来自共享面板（demo.shared），这里只写业务流程。
//
// 可直接用的（demo.shared 注入）：API_TOKEN / BASE_URL / sendHeaders / api.getCustomers / makeUsers
// 内置原语：get / post / send（网络，自动一请求一日志）、serviceAlive（服务 check）、log / ok（输出）
// 显式 import 共享面板：单独执行本脚本时也能拿到 api/常量；
// 经 sg 流水线执行时 runner 已装载过，这里命中 ESM 缓存不会重复执行。
import './demo.shared.mjs';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

// 1) 服务组活性 check（「执行前先 check」的标准姿势）
const alive = await serviceAlive('demo-group');
if (!alive) {
  fail('demo-group 服务未启动——请先 nx-nx sg start demo-group');
} else {
  ok('服务组活性 OK，开始业务请求');
}

// 2) 业务 API：getCustomers（签名见 demo.shared 的 api 封装）
const r = await api.getCustomers({ page: 1, size: 10, keyword: '' });
if (!expectStatus(r, 200, 'getCustomers')) {
  fail(`getCustomers 失败: ${r.status}`);
} else {
  ok(`getCustomers 成功: ${JSON.stringify(r.json?.data ?? r.json)?.slice(0, 160)}`);
  log(`日志文件: ${r.logFile}`);
}

// 3) 创建一条客户（POST）
const created = await api.createCustomer({ name: makeUsers(1)[0].name, phone: '13800000000', level: 'vip' });
ok(`createCustomer: ${created.status}`);

// 4) 共享面板的随机数据 + token
log(`本次使用的 token: ${API_TOKEN.slice(0, 8)}…  随机数据: ${JSON.stringify(makeUsers(2))}`);
