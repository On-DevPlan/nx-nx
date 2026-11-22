// 启动脚本文本框 ↔ argv：带空格的路径不能被拆坏，引号要能往返。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { splitArgsText, joinArgsText } = await import('../../src/modules/service-group/args-text.js');

test('参数文本：空白拆分，引号包住的空格保持在同一项', () => {
  assert.deepEqual(splitArgsText('--port 18080 --config config/staging.json'), [
    '--port',
    '18080',
    '--config',
    'config/staging.json',
  ]);
  assert.deepEqual(splitArgsText('--config "C:\\Program Files\\app\\conf.json" --port 18081'), [
    '--config',
    'C:\\Program Files\\app\\conf.json',
    '--port',
    '18081',
  ]);
  assert.deepEqual(splitArgsText("--name='a b' --x \"\""), ['--name=a b', '--x', '']);
});

test('参数文本：argv 回写成文本后能原样解析回来', () => {
  const args = ['--config', 'C:\\Program Files\\app\\conf.json', '--name', 'a b', '--empty', ''];
  assert.deepEqual(splitArgsText(joinArgsText(args)), args);
  assert.equal(joinArgsText(['--port', '18080']), '--port 18080');
});
