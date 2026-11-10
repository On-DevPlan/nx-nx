// spike：生成脚本 —— 从 action 声明产出两份生成物。
//
//   node --import tsx spike/zod-decorator/scripts/generate.mts
//
// 两份生成物都是**派生产物**，不入版本库也行；这里入库是为了让评审能直接 diff。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/registry.js';
import { generateCliTreeJson, generateClient } from '../src/codegen.js';
import { demoModule } from '../src/demo/module.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'generated');

const actions = buildRegistry([demoModule]);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'cli-tree.json'), generateCliTreeJson(actions), 'utf8');
writeFileSync(
  join(OUT, 'client.generated.ts'),
  generateClient(actions, { schemaImport: '../src/demo/schemas.js' }),
  'utf8',
);

console.log(`生成完毕：${actions.length} 条 action → cli-tree.json + client.generated.ts`);
