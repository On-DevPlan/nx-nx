// 字段描述门禁（MCP 前置基础设施）。
//
// 规则：每个 action 的每个输入字段都必须带非空 .describe()。
//
// 为什么写成机器检查：字段描述同时喂四个消费方——help 的「参数:」段、
// cli-tree.json 的字段说明、Swagger/OpenAPI 的参数 description、以及未来的
// MCP inputSchema（AI 按描述调用工具）。少写一个 describe，四处同时变哑；
// 这正是「action 语义要强」的基石，人审守不住，测试守得住。
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('每个 action 的每个输入字段都带非空 describe()', async () => {
  const { registry } = await import('../../src/runtime/registry.ts');
  const missing = [];
  let fieldCount = 0;
  for (const a of registry.actions) {
    const fields = a.fields ?? [];
    for (const f of fields) {
      fieldCount += 1;
      if (typeof f.desc !== 'string' || !f.desc.trim()) missing.push(`${a.id}.${f.name}`);
    }
  }
  assert.ok(fieldCount > 0, '模板里至少应有一个带字段的 action（否则本测试失去意义）');
  assert.deepEqual(
    missing,
    [],
    '以下字段缺 .describe()（补上描述，help/Swagger/MCP 都靠它）:\n  ' + missing.join('\n  '),
  );
});

test('describeInput 采集到的是 zod .describe() 的原文', async () => {
  const { describeInput } = await import('../../src/runtime/zod-bridge.ts');
  const { z } = await import('zod');
  const fields = describeInput(
    z.object({
      a: z.string().describe('字段 A 的说明'),
      b: z.number().optional().describe('字段 B 的说明'),
    }),
  );
  assert.equal(fields.find((f) => f.name === 'a')?.desc, '字段 A 的说明');
  assert.equal(fields.find((f) => f.name === 'b')?.desc, '字段 B 的说明');
});
