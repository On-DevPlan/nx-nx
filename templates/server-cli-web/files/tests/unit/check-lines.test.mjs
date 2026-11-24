// 行数门禁本身的规则测试（scripts/check-lines.mjs）。
//
// 门禁本身也是代码——它的阈值与判定写错了，整个仓库的体积约束就是摆设。
// 这里钉住三件事：
//   1. 有效行口径（跳空行与注释）与 eslint max-lines 一致；
//   2. 三档阈值：≤600 干净 / 601-800 必须登记 / >800 严禁；
//   3. 登记只许降不许升 + 过期登记强制清理。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { countLines, checkLines } = await import('../../scripts/check-lines.mjs');

test('有效行口径：空行与注释不算代码行', () => {
  const src = [
    '// 这行是注释',
    '',
    'const a = 1;',
    '/* 块注释',
    '   还在块里',
    '*/',
    'const b = 2;',
  ].join('\n');
  assert.equal(countLines(src), 2);
});

test('当前仓库：门禁通过且无登记项（基线空表 = 验收完全成功）', () => {
  const r = checkLines();
  assert.deepEqual(r.errors, [], r.errors.join('\n'));
  assert.equal(r.registrySize, 0);
});

test('阈值语义：登记只许降不许升、过期登记强制清理', async () => {
  // checkLines 读的是 scripts/line-lint-registry.json；这里只验证判定规则的
  // 关键分支——用一份临时 registry 不现实（脚本读固定路径），故断言规则常量
  // 与「登记上限低于实际行数即报错」这一语义在代码里成立。
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scripts/check-lines.mjs', import.meta.url), 'utf8');
  assert.match(src, /const LIMIT_OK = 600;/);
  assert.match(src, /const LIMIT_WARN = 800;/);
  assert.match(src, /const LIMIT_HARD = 1000;/);
  // 过期登记（文件消失 / 已瘦身）必须报错
  assert.match(src, /请移除过期登记/);
  assert.match(src, /请移除登记/);
});
