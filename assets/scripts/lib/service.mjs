// 服务组原语：脚本内的活性 check 与启停控制。
//
// 全部通过 nx-nx serve 的 HTTP API 实现（端口来自 NX_NX_SERVE_PORT，
// sg 流水线/serve 环境自动注入；直跑脚本时默认 7880）。
//
// 典型用法（「执行 server 的时候先 check」）：
//   if (!(await serviceAlive('demo-group'))) {
//     await serviceStart('demo-group');   // 失活自愈：本质是调 scripthub 里已存在的启动入口
//   }
import { env } from './sys.mjs';
import { get, post } from './http.mjs';

function base() {
  return `http://127.0.0.1:${env('NX_NX_SERVE_PORT', '7880')}`;
}

// 活性 check：返回 bool（服务组存在但检测失败也算「不活」）
export async function serviceAlive(groupId) {
  try {
    const r = await get(`${base()}/api/service-groups/${groupId}/alive`);
    return r?.json?.alive === true;
  } catch {
    return false;
  }
}

// 活性详情：{ alive, detail }（detail 说明端口/HTTP 探测结果）
export async function serviceCheck(groupId) {
  try {
    const r = await get(`${base()}/api/service-groups/${groupId}/alive`);
    return { alive: r?.json?.alive === true, detail: r?.json?.detail ?? '' };
  } catch (e) {
    return { alive: false, detail: 'serve 不可达: ' + (e?.message ?? e) };
  }
}

// 启动主脚本（幂等：已在运行则跳过）
export async function serviceStart(groupId) {
  const r = await post(`${base()}/api/service-groups/${groupId}/start`);
  return r?.json ?? { started: false, detail: 'serve 不可达' };
}

// 停止（关停脚本 → 杀端口 → 杀 pid）
export async function serviceStop(groupId) {
  const r = await post(`${base()}/api/service-groups/${groupId}/stop`);
  return r?.json ?? { stopped: false, detail: 'serve 不可达' };
}

// 运行态快照（status/pid/活性/自愈计数）
export async function serviceStatus(groupId) {
  const r = await get(`${base()}/api/service-groups/${groupId}`);
  return r?.json?.runtime ?? undefined;
}
