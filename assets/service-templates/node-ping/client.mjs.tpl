// {{ID}} 的 client：业务请求各占一个入口，基础设施与示例数据来自共享面板。
// 先跑 nx-nx sg start {{ID}}，再跑 nx-nx sg run {{ID}}。
import './{{ID}}.shared.mjs';

heading('client 开始：验证 /ping 与共享用户数据');

const ping = await get(BASE_URL + DEMO_REQUEST.path);
if (!expectStatus(ping, 200, 'GET ' + DEMO_REQUEST.path)) {
  process.exitCode = 1;
  fail('探活请求失败: status=' + ping.status + ' body=' + String(ping.body).slice(0, 120));
} else if (String(ping.body).trim() !== DEMO_REQUEST.expected) {
  process.exitCode = 1;
  fail('探活响应不是 ' + DEMO_REQUEST.expected + ': ' + String(ping.body).slice(0, 120));
} else {
  ok('GET /ping → pong ✔（' + ping.ms + 'ms）');
}

const active = listUsers();
ok('共享面板提供 ' + active.length + ' 位活跃用户：' + active.map((u) => u.name).join('、'));
const users = await get(BASE_URL + '/api/users');
if (!expectStatus(users, 200, 'GET /api/users')) {
  process.exitCode = 1;
  fail('共享数据接口失败: status=' + users.status + ' body=' + String(users.body).slice(0, 120));
} else {
  const payload = JSON.parse(String(users.body));
  const serverActive = (payload.users || []).filter((u) => u.active).length;
  if (payload.total === DEMO_USERS.length && serverActive === active.length) {
    ok('服务端 /api/users 读到同一份共享数据 ✔');
  } else {
    process.exitCode = 1;
    fail('共享数据不一致: 面板活跃 ' + active.length + ' / 服务活跃 ' + serverActive);
  }
}
