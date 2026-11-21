// {{ID}} 的 client 脚本：业务请求单独一个文件，基础设施来自共享面板。
//
// 单独跑: nx-nx script run {{ID}}-client
// 走流水线: nx-nx sg run {{ID}}（启动 → 等就绪 → 本脚本依次执行）
//
// 这份 client 只有一件事：请求主脚本的 /ping，确认拿到 pong。
// 换成你自己的业务请求时，把 get() 换成 POST / 你的接口即可。
import './{{ID}}.shared.mjs';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

heading('client 开始：请求 ' + BASE_URL + '/ping');
const r = await get(BASE_URL + '/ping');
if (!expectStatus(r, 200, 'GET /ping')) {
  fail('GET /ping 失败: status=' + r.status + ' body=' + String(r.body).slice(0, 120));
} else if (String(r.body).trim() !== 'pong') {
  fail('GET /ping 返回不是 pong: ' + String(r.body).slice(0, 120));
} else {
  ok('GET /ping → pong ✔（耗时 ' + r.ms + 'ms，请求日志 ' + r.logFile + '）');
}
