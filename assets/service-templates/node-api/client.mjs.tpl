// {{ID}} 的 client 脚本：业务请求单独一个文件，基础设施来自共享面板。
//
// 单独跑: nx-nx script run {{ID}}-client
// 走流水线: nx-nx sg run {{ID}}（check → 启动 → 等就绪 → 本脚本执行）
import './{{ID}}.shared.mjs';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

// 1) 先确认服务活着（serviceAlive 是内置原语，走 serve 的活性检测）
const alive = await serviceAlive('{{ID}}');
if (!alive) {
  fail('{{ID}} 未启动——先 nx-nx sg start {{ID}}');
} else {
  ok('服务活性 OK，开始业务请求');
  log('本次 token: ' + API_TOKEN.slice(0, 8) + '…');
}

// 2) GET：分页查询
const list = await api.getCustomers({ page: 1, size: 10, keyword: '' });
if (!expectStatus(list, 200, 'getCustomers')) {
  fail('getCustomers 失败: ' + list.status);
} else {
  ok('getCustomers 成功: ' + JSON.stringify(list.json?.data ?? list.json).slice(0, 160));
  log('请求日志: ' + list.logFile);
}

// 3) POST：创建一条
const created = await api.createCustomer({ name: makeUsers(1)[0].name, level: 'vip' });
if (!expectStatus(created, 201, 'createCustomer')) {
  fail('createCustomer 失败: ' + created.status);
} else {
  ok('createCustomer 成功: ' + JSON.stringify(created.json?.item ?? created.json).slice(0, 120));
}
