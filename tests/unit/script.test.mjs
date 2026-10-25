// 内置脚本域的单元测试：别名模块、脚本清单、脚本执行。
// 经 tsx 跑 src；脚本一律写到临时目录，绝不碰真实目录。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aliasesPath, listScripts, resolveScript } from '../../src/core/script/paths.js';
import { aliases, flagTokens, runScript, scripts } from '../../src/core/script/service.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'nxnx-script-'));
}

test('别名清单与实现一一对应（installAliases 不抛错就是过了）', async () => {
  const mod = await import(pathToFileURL(aliasesPath()).href);
  const list = await aliases();
  assert.ok(list.length >= 20, `别名太少: ${list.length}`);
  // installAliases 会校验「清单里的每个名字都有实现、实现都在清单里」
  const target = {};
  mod.installAliases(target);
  for (const a of list) {
    assert.equal(typeof target[a.name], 'function', `别名 ${a.name} 没挂上`);
  }
  // 清单必须覆盖几个必备原语
  for (const must of ['readText', 'writeText', 'walk', 'run', 'sh', 'log', 'parseArgs']) {
    assert.ok(list.some((a) => a.name === must), `缺必备别名: ${must}`);
  }
});

test('别名清单里的每一项都有分组与说明（人读文档不能空着）', async () => {
  for (const a of await aliases()) {
    assert.ok(a.group, `别名 ${a.name} 没有分组`);
    assert.ok(a.desc, `别名 ${a.name} 没有说明`);
  }
});

test('内置脚本清单至少含 sync-nx-skills，且带用法', () => {
  const list = scripts();
  const s = list.find((x) => x.name === 'sync-nx-skills');
  assert.ok(s, '缺 sync-nx-skills');
  assert.ok(s.description.includes('skill'), '说明没提 skill');
  assert.ok(s.usage.includes('--root'), '用法没写 --root');
});

test('listScripts 与 scripts() 一致（core 内外两套入口同一真相）', () => {
  assert.deepEqual(
    listScripts().map((s) => s.name),
    scripts().map((s) => s.name),
  );
});

test('resolveScript：内置名可解析，未知名报 NOT_FOUND', () => {
  assert.equal(resolveScript('sync-nx-skills').name, 'sync-nx-skills');
  assert.throws(() => resolveScript('no-such-script-xyz'), (err) => {
    assert.equal(err.code, 'NOT_FOUND');
    return true;
  });
});

test('runScript：脚本里的内置全局函数可用（裸名调用）', async () => {
  const dir = tmp();
  const file = join(dir, 'demo.mjs');
  writeFileSync(
    file,
    [
      "import { installAliases } from '" + pathToFileURL(aliasesPath()).href + "';",
      'installAliases(globalThis);',
      "log('值=' + (1 + 1));",
      "const r = run(process.execPath, ['-e', 'console.log(42)']);",
      "log('子进程=' + r.stdout.trim());",
    ].join('\n'),
  );
  const r = await runScript(file);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /值=2/);
  assert.match(r.stdout, /子进程=42/);
});

test('runScript：脚本非零退出码如实带回', async () => {
  const dir = tmp();
  const file = join(dir, 'boom.mjs');
  writeFileSync(file, "process.exit(3);\n");
  const r = await runScript(file);
  assert.equal(r.code, 3);
});

test('flagTokens：布尔不带值，字符串用等号连写（值里的空格不会散成两个 token）', () => {
  assert.deepEqual(flagTokens({ force: true, root: 'D:\\a b', off: false, n: 3 }), [
    '--force',
    '--root=D:\\a b',
    '--n=3',
  ]);
});
