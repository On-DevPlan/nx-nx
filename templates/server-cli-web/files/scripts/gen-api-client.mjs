// 生成前端 apiclient 与 CLI 树快照：node --import tsx scripts/gen-api-client.mjs
// （pnpm gen:api）。产物入库、由 tests/unit/api-client.test.mjs 对账新鲜度。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');

const { registry } = await import('../src/runtime/registry.ts');
const { generateClientSource, generateTreeJson } = await import('../src/runtime/codegen.ts');

// 只生成 zod 通道（@action 装饰、带 fields）的 action；
// builder 通道继续走 typed client（boot.commands 派发），两条通道并存。
const zodActions = registry.actions.filter((a) => Array.isArray(a.fields));

const OUT = join(ROOT, 'src', 'web', 'frontend', 'api');
writeFileSync(join(OUT, 'client.generated.ts'), generateClientSource(zodActions, { schemaImport: '../../../modules/home/schemas.js' }));
writeFileSync(join(OUT, 'cli-tree.json'), generateTreeJson(zodActions));
console.log(`gen:api — ${zodActions.length} 个 zod action → client.generated.ts + cli-tree.json`);
