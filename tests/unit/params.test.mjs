// 脚本参数的单元测试：@param 声明解析 + 表单值 → argv 的拼装。
//
// 这块是「Web 上不让人手打 --xxx」的契约所在：
//   声明解析  → 面板自动渲染成对应控件（文本/数字/开关/下拉）
//   值 → token → 脚本侧 parseArgs 读到的 flags
// 语义错了，用户就是「明明填了值脚本却没拿到」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultValues, paramTokens, parseParams } from '../../src/core/script/params.js';

test('@param 声明解析：类型 / 默认值 / 说明 / 下拉选项', () => {
  const params = parseParams(
    [
      '// @param port number 18999 监听端口',
      '// @param host string 127.0.0.1 绑定地址',
      '// @param mode select(dev|prod) dev 运行模式',
      '// @param verbose boolean false 输出详细信息',
      '// @param note string - 备注',
    ].join('\n'),
  );
  assert.equal(params.length, 5);
  assert.deepEqual(
    params.map((p) => p.name),
    ['port', 'host', 'mode', 'verbose', 'note'],
  );
  const port = params[0];
  assert.equal(port.type, 'number');
  assert.equal(port.default, '18999');
  assert.equal(port.desc, '监听端口');
  const mode = params[2];
  assert.equal(mode.type, 'select');
  assert.deepEqual(mode.options, ['dev', 'prod']);
  // '-' 表示无默认值 → 表单留空
  assert.equal(params[4].default, '');
});

test('@param 声明：重复名字只认第一个；正文里的 @param 不算', () => {
  const params = parseParams(
    ['// @param a string x 说明', '// @param a string y 重复', '', '// @param b string z 正文里的'].join('\n'),
  );
  assert.deepEqual(
    params.map((p) => p.name),
    ['a'],
  );
  assert.equal(params[0].desc, '说明');
});

test('表单值 → token：值拼成 --k=v，空值跳过，boolean true 才是 --k', () => {
  const params = parseParams(
    ['// @param port number 18999 端口', '// @param host string 127.0.0.1 地址', '// @param verbose boolean false 详细'].join(
      '\n',
    ),
  );
  const tokens = paramTokens(params, { port: '8080', host: '', verbose: 'true' });
  assert.deepEqual(tokens, ['--port=8080', '--verbose']);
  // boolean false 不产生 token
  const off = paramTokens(params, { verbose: 'false' });
  assert.deepEqual(off, []);
});

test('表单值里的空格不会散成两个 token（等号连写）', () => {
  const params = parseParams(['// @param msg string - 说明'].join('\n'));
  const tokens = paramTokens(params, { msg: 'hello world' });
  assert.deepEqual(tokens, ['--msg=hello world']);
  assert.equal(tokens.length, 1);
});

test('默认值铺成表单初值', () => {
  const params = parseParams(['// @param port number 18999 端口', '// @param x string - 无默认'].join('\n'));
  assert.deepEqual(defaultValues(params), { port: '18999', x: '' });
});
