// 脚本工作台的前端小工具测试（src/modules/script/helpers.ts）。
//
// 这一组盯的是「Web 上参数怎么变成 argv」——
//   用户填的是**值**（不写 --xxx），界面负责拼成脚本侧 parseArgs 认的 token。
// 语义错了就是「填了值脚本拿不到」，而且只在运行时暴露，所以要有测试盯着。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customArgTokens } from '../../src/modules/script/helpers.js';

test('自定义参数：给了名字就拼成 --名=值', () => {
  assert.deepEqual(customArgTokens('port', '8080'), ['--port=8080']);
});

test('自定义参数：名字留空 → 该值作为位置参数', () => {
  assert.deepEqual(customArgTokens('', 'D:\\proj'), ['D:\\proj']);
  assert.deepEqual(customArgTokens('   ', 'D:\\proj'), ['D:\\proj']);
});

test('自定义参数：值留空 → 不产生任何 token', () => {
  assert.deepEqual(customArgTokens('port', ''), []);
  assert.deepEqual(customArgTokens('port', '   '), []);
});

test('自定义参数：值里的空格不散成两个 token（等号连写）', () => {
  const tokens = customArgTokens('msg', 'hello world');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0], '--msg=hello world');
});

test('自定义参数：容忍用户手写了横线（不重复加）', () => {
  assert.deepEqual(customArgTokens('--port', '8080'), ['--port=8080']);
});
