// nx-kv servicegroup 的共享面板：常量 + 接口清单 + 起飞闸门 + 断言函数。
// 组内每个 server / health / client 执行前都会自动装载，扩展脚本直接复用。
import { existsSync } from 'node:fs';
import { installAliases } from './aliases.mjs';
import { defineSpace } from './_ns.mjs';

installAliases(globalThis);

globalThis.BASE_URL = process.env.NX_SERVICE_URL || 'http://127.0.0.1:' + (Number(process.env.NX_SERVICE_PORT) || 7878);
globalThis.EXPECTED_APP = 'nx-kv';
globalThis.KV_ENDPOINTS = {
  ping: '/api/ping',
  health: '/api/health',
  bootstrap: '/api/bootstrap',
  contract: '/api/contract',
  localtasks: '/api/localtasks',
};

// 启动闸门：判依赖，不判自己。给了 NX_KV_CLI 就要求它真实存在。
globalThis.checkUp = function checkUp() {
  const cli = process.env.NX_KV_CLI;
  return !cli || existsSync(cli);
};

globalThis.assertApi = function assertApi(name, payload, verify, detail) {
  if (!payload || payload.ok !== true) {
    process.exitCode = 1;
    fail(`${name}: 信封不是 ok=true → ${detail}`);
    return;
  }
  if (!verify(payload.data)) {
    process.exitCode = 1;
    fail(`${name}: 数据不符合预期 → ${detail}`);
    return;
  }
  ok(`${name} ✔ ${detail}`);
};

export const SPACE = defineSpace({
  name: 'nx-kv-servicegroup',
  description: 'nx-kv serve 的服务底座：接口清单 + 断言函数 + 起飞闸门',
  state: { BASE_URL, EXPECTED_APP, KV_ENDPOINTS },
});

globalThis.__tests = {
  '接口清单齐全': () => Object.keys(KV_ENDPOINTS).length === 5,
  'BASE_URL 指向本机': () => BASE_URL.startsWith('http://127.0.0.1:'),
  'checkUp 是函数': () => typeof checkUp === 'function',
};
