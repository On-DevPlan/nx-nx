// nx-kv 面板的长驻启动脚本：由 servicegroup 负责托管、探活与停止。
// NX_KV_CLI 可以是全局命令 nx-kv，也可以是本机 bin/kv.mjs 绝对路径。
import { spawn } from 'node:child_process';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const port = Number(process.env.NX_SERVICE_PORT || argv.flags.port || 7878);
const cli = process.env.NX_KV_CLI || 'nx-kv';
const isNodeEntry = /\.(mjs|cjs|js|ts)$/i.test(cli);
const command = isNodeEntry ? process.execPath : cli;
const args = isNodeEntry ? [cli, 'serve', '--no-open', '--port', String(port)] : ['serve', '--no-open', '--port', String(port)];
const cwd = process.env.NX_KV_PROJECT_ROOT || process.env.NX_SERVICE_DIR || process.cwd();

log(`启动 nx-kv serve：${command} ${args.join(' ')}（cwd=${cwd}）`);
const child = spawn(command, args, {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, NX_SERVE_NO_OPEN: '1', NX_SERVICE_PORT: String(port) },
});

const stopChild = () => child.kill('SIGTERM');
process.on('SIGTERM', stopChild);
process.on('SIGINT', stopChild);
child.on('error', (err) => {
  console.error('[nx-kv] 启动失败: ' + String(err.message || err));
  process.exitCode = 1;
});
child.on('exit', (code) => process.exit(typeof code === 'number' ? code : 1));

setInterval(() => log('[nx-kv heartbeat] pid=' + child.pid + ' port=' + port), 30000).unref();
