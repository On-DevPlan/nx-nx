// 生成前端 apiclient 与 CLI 树快照：node --import tsx scripts/gen-api-client.mjs
// （pnpm gen:api）。产物入库、由 tests/unit/api-client.test.mjs 对账新鲜度。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');

const { registry } = await import('../src/runtime/registry.ts');
const { generateClientSource, generateTreeJson } = await import('../src/runtime/codegen.ts');

// 只有一条通道：@action 装饰收集到的 zod 契约（全部 action 都带 fields）。
// 生成物覆盖每条带 http 的 action；stream（SSE）不进 req/resp 形状的 client。
const zodActions = registry.actions.filter((a) => Array.isArray(a.fields));

const OUT = join(ROOT, 'src', 'web', 'frontend', 'api');
/** 内容一样就不落盘（避免每次 pnpm test 都刷新生成物 mtime → IDE 重扫、tsc 缓存失效）。 */
function writeIfChanged(abs, body) {
  if (existsSync(abs) && readFileSync(abs, 'utf8') === body) return false;
  writeFileSync(abs, body, 'utf8');
  return true;
}

writeIfChanged(join(OUT, 'client.generated.ts'), generateClientSource(zodActions));
writeIfChanged(join(OUT, 'cli-tree.json'), generateTreeJson(zodActions));
console.log(`gen:api — ${zodActions.length} 个 zod action → client.generated.ts + cli-tree.json`);
