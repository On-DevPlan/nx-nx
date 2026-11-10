// codegen apiclient 的新鲜度与覆盖对账（zod 装饰器通道，见 src/runtime/codegen.ts）。
//
// 生成物 client.generated.ts / cli-tree.json **入库**（模板渲染时原样带出），
// 这条测试把「入库的」与「从当前 registry 重新生成的」逐字节对账——
// 改了 schema / action 声明忘了 pnpm gen:api，这里当场红，生成物永远不会悄悄过期。
// 同时钉住 schema 命名约定（<camelCase(actionId)>Input/Output）：约定破了
// codegen 会生成指向不存在符号的 import，typecheck 也会红，两道闸互为备份。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { registry } = await import('../../src/runtime/registry.ts');
const { generateClientSource, generateTreeJson } = await import('../../src/runtime/codegen.ts');

const zodActions = registry.actions.filter((a) => Array.isArray(a.fields));

test('单通道：全部 action（业务 + 平台）都是 @action 收集的 zod 契约', () => {
  const ids = zodActions.map((a) => a.id).sort();
  assert.deepEqual(ids, [
    'help',
    'home.bootstrap',
    'home.greet',
    'home.health',
    'home.routes',
    'serve',
    'setting.get',
    'setting.set',
    'skill.get',
    'skill.groups',
    'skill.install',
    'skill.list',
    'version',
  ]);
  // 平台命令（serve/help/version）无 http，不进 apiclient；全部 action 都带 fields
  assert.equal(registry.actions.length, zodActions.length);
});

test('生成物与 registry 逐字节一致（改声明必须 pnpm gen:api）', () => {
  const generatedPath = join(ROOT, 'src', 'web', 'frontend', 'api', 'client.generated.ts');
  assert.equal(
    readFileSync(generatedPath, 'utf8'),
    generateClientSource(zodActions),
    'client.generated.ts 过期——运行 pnpm gen:api 重新生成',
  );
  const treePath = join(ROOT, 'src', 'web', 'frontend', 'api', 'cli-tree.json');
  assert.equal(
    readFileSync(treePath, 'utf8'),
    generateTreeJson(zodActions),
    'cli-tree.json 过期——运行 pnpm gen:api 重新生成',
  );
});

test('生成物覆盖每条带 HTTP 的 zod action（id 可被「面板入口」对账检索到）', () => {
  const src = readFileSync(join(ROOT, 'src', 'web', 'frontend', 'api', 'client.generated.ts'), 'utf8');
  for (const a of zodActions) {
    if (!a.http) continue;
    assert.ok(src.includes(`action: ${a.id}`), `生成物缺 ${a.id} 的方法`);
  }
});

test('zod 解析：布尔字符串不翻转（z.coerce.boolean 的坑被绕开）', async () => {
  const greet = zodActions.find((a) => a.id === 'home.greet');
  const { normalizeCliValue, parseInput } = await import('../../src/runtime/zod-bridge.ts');
  const parsed = parseInput(
    greet.input,
    { name: '甲', loud: normalizeCliValue(greet.fields.find((f) => f.name === 'loud'), 'false') },
    '{{name}} greet <name>',
  );
  assert.equal(parsed.loud, false, "'false' 必须解析为 false");
  assert.equal(parsed.name, '甲');
});
