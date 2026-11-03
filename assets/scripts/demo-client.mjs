// 演示：client 脚本（服务组的次脚本）。
// 业务请求单独一个文件——基础设施全部来自共享面板（demo.shared），这里只写业务流程。
//
// 可直接用的（来自 demo.shared 的注入）：API_TOKEN, BASE_URL, makeUsers, serviceAlive, sendHeaders
// 内置原语：httpGet / send（网络）、log / ok（输出）……
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const health = await httpGet(`${BASE_URL}/health`);
if (!health.ok) {
  fail(`服务不健康: ${health.status} ${health.body}`);
} else {
  ok(`服务健康: ${health.json.ok} (pid ${health.json.pid})`);
}

// 用共享面板的常量与函数构造一次业务请求
const users = makeUsers(3);
log(`使用 token: ${API_TOKEN.slice(0, 8)}…`);
log(`随机数据: ${JSON.stringify(users)}`);

const r = await send({
  method: 'POST',
  url: `${BASE_URL}/echo`,
  headers: sendHeaders(),
  body: { users, note: '来自 demo-client' },
  label: '[echo]',
});
log(`echo 响应: ${r.ok} ${r.status}`);

// 服务组活性函数（服务面板提供）：执行前先 check 的示范
const alive = await serviceAlive('demo-group');
log(`serviceAlive('demo-group') = ${alive}`);
