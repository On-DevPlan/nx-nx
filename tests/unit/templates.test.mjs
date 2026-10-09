// 模板引擎的单元测试。
// 这里的每一条都对应一个真实踩过/差点踩的坑，删测试前先看注释。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderString, resolveVars, listTemplates, loadTemplate } from '../../src/core/templates.js';
import { generate, walkTemplate, assertTargetUsable } from '../../src/core/generate.js';
import { isTextPath } from '../../src/core/skills/text-util.js';

const TPL_ROOT = new URL('../../templates/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function tmp() {
  return mkdtempSync(join(tmpdir(), 'nxnx-test-'));
}

test('renderString: 基本替换', () => {
  assert.equal(renderString('hello {{name}}', { name: 'nx-ab' }), 'hello nx-ab');
});

test('renderString: 变量缺失必须抛错，不能漏成字面量', () => {
  assert.throws(() => renderString('{{nope}}', { name: 'x' }), /未声明的变量/);
});

test('renderString: GitHub Actions 的 ${{ }} 不被误替换', () => {
  // npm-publish.yml 里全是 ${{ secrets.X }} / ${{ steps.x.y }}——
  // 点号和空格不在 [\w-] 里，正则天然不匹配。这条测试钉住这个边界，
  // 谁要是「顺手放宽」正则，先让这条红。
  const src = 'token: ${{ secrets.GITHUB_TOKEN }}\ntag: ${{ steps.pkg.outputs.tag }}';
  assert.equal(renderString(src, {}), src);
});

test('renderString: 键含连字符也能识别（\\w 不含 -，字符类必须显式带）', () => {
  assert.equal(renderString('{{app-name}}', { 'app-name': 'ok' }), 'ok');
});

test('resolveVars: letters 派生 name / envPrefix', () => {
  const meta = { id: 'server-cli-web', namePrefix: 'nx-', options: [{ name: 'letters', type: 'letters', required: true }] };
  const vars = resolveVars(meta, { letters: 'AB' });
  assert.equal(vars.name, 'nx-ab');
  assert.equal(vars.envPrefix, 'NX_AB');
});

test('resolveVars: 字母拼出与模板同名 → 拒绝', () => {
  const meta = { id: 'nx-ab', namePrefix: 'nx-', options: [{ name: 'letters', type: 'letters', required: true }] };
  assert.throws(() => resolveVars(meta, { letters: 'ab' }), /同名/);
});

test('resolveVars: 字母大小写宽容（ABC → abc），非法形态拒绝', () => {
  const meta = { id: 't', namePrefix: 'nx-', options: [{ name: 'letters', type: 'letters', required: true }] };
  // 大写宽容：模板与 bin 名全小写，用户敲 NX-AB 也该明白指什么
  assert.equal(resolveVars(meta, { letters: 'ABC' }).letters, 'abc');
  assert.equal(resolveVars(meta, { letters: '  ab  ' }).letters, 'ab');
  for (const bad of ['ab1', 'abcdef', '!!']) {
    assert.throws(() => resolveVars(meta, { letters: bad }), /1~5 位小写字母/);
  }
});

test('resolveVars: enum 校验值域', () => {
  const meta = {
    id: 't',
    options: [{ name: 'scheme', type: 'enum', values: ['a', 'b'] }],
  };
  assert.equal(resolveVars(meta, { scheme: 'a' }).scheme, 'a');
  assert.throws(() => resolveVars(meta, { scheme: 'z' }), /只能是 a \| b/);
});

test('resolveVars: 默认值生效，required 缺失报错', () => {
  const meta = {
    id: 't',
    options: [
      { name: 'a', type: 'string', default: 'da' },
      { name: 'b', type: 'string', required: true },
    ],
  };
  const vars = resolveVars(meta, { b: 'x' });
  assert.equal(vars.a, 'da');
  assert.throws(() => resolveVars(meta, {}), /缺少必填选项: b/);
});

test('resolveVars: number 强转 + 非法值报错', () => {
  const meta = { id: 't', options: [{ name: 'port', type: 'number' }] };
  assert.equal(resolveVars(meta, { port: '7881' }).port, 7881);
  assert.throws(() => resolveVars(meta, { port: 'abc' }), /必须是数字/);
});

test('listTemplates: 真实模板库至少有一个合法模板', async () => {
  const { templates, errors } = await listTemplates();
  assert.ok(templates.length >= 1, '至少应有 server-cli-web');
  const scw = templates.find((t) => t.id === 'server-cli-web');
  assert.ok(scw, 'server-cli-web 存在');
  assert.equal(scw.namePrefix, 'nx-');
  assert.deepEqual(errors, []);
});

test('loadTemplate: 不存在的 id 报可用列表', async () => {
  await assert.rejects(() => loadTemplate('no-such'), /可用:/);
});

test('loadTemplate: 目录穿越被拒', async () => {
  await assert.rejects(() => loadTemplate('../..'), /非法模板 id/);
});

// ---- generate ----

function makeMiniTemplate(root) {
  const files = join(root, 'files');
  mkdirSync(join(files, 'bin', '{{letters}}'), { recursive: true });
  mkdirSync(join(files, 'assets', 'img'), { recursive: true });
  writeFileSync(join(files, 'pkg.json'), '{"n":"{{name}}"}');
  writeFileSync(join(files, 'bin', '{{letters}}', 'run.mjs'), '// {{name}}\n');
  // 假二进制：含 NUL 字节，验证不被 utf8 读写损坏
  writeFileSync(join(files, 'assets', 'img', 'logo.bin'), Buffer.from([0x89, 0x00, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, 'template.json'), '{"id":"mini","name":"mini"}');
  return root;
}

test('generate: 路径与内容都替换；二进制原样复制', async () => {
  const tpl = makeMiniTemplate(tmp());
  const out = join(tmp(), 'out');
  const r = await generate({
    templateDir: tpl,
    targetDir: out,
    vars: { letters: 'ab', name: 'nx-ab' },
  });
  assert.equal(r.created, 3);
  assert.ok(existsSync(join(out, 'bin', 'ab', 'run.mjs')), '路径占位符已替换');
  assert.equal(readFileSync(join(out, 'pkg.json'), 'utf8'), '{"n":"nx-ab"}');
  assert.deepEqual(
    readFileSync(join(out, 'assets', 'img', 'logo.bin')),
    Buffer.from([0x89, 0x00, 0x50, 0x4e, 0x47]),
    '二进制逐字节一致'
  );
});

test('generate: 目标目录非空直接拒绝（绝不覆盖）', async () => {
  const tpl = makeMiniTemplate(tmp());
  const out = tmp();
  writeFileSync(join(out, 'existing.txt'), 'x');
  await assert.rejects(() => generate({ templateDir: tpl, targetDir: out, vars: {} }), /已存在且非空/);
});

test('generate: 变量含 ../ 时渲染路径被当场拒绝', async () => {
  const tpl = makeMiniTemplate(tmp());
  const out = join(tmp(), 'out');
  await assert.rejects(
    () => generate({ templateDir: tpl, targetDir: out, vars: { letters: '../escape', name: 'x' } }),
    /非法段|越出目标目录/
  );
  // 语义说明：非法段检查逐文件进行，抛错前可能已在目标目录内写了若干合法文件。
  // 生成是「全有或全无」的体验保证靠 check-dir 预检 + 目录非空即拒的重试保护：
  // 修完变量重新生成时，用户会被「目录非空」拦住，不会得到半成品混着旧文件的目录。
  // 这里钉死的关键行为：**目标目录之外的任何路径都没有被写出**。
  const escapeDir = join(out, '..', 'escape');
  assert.ok(!existsSync(escapeDir), `../escape 绝不能被写出来: ${escapeDir}`);
});

test('walkTemplate: 跳过 node_modules / .git / template.json', async () => {
  const root = tmp();
  const files = join(root, 'files');
  mkdirSync(join(files, 'node_modules', 'x'), { recursive: true });
  mkdirSync(join(files, '.git'), { recursive: true });
  writeFileSync(join(files, 'keep.txt'), 'k');
  writeFileSync(join(files, 'node_modules', 'x', 'drop.txt'), 'd');
  writeFileSync(join(files, '.git', 'drop2.txt'), 'd');
  const rels = await walkTemplate(files);
  assert.deepEqual(rels, ['keep.txt']);
});

test('isTextPath: 按扩展名分流（jsx/json/md 是文本，png/ico 是二进制）', () => {
  assert.equal(isTextPath('src/a.jsx'), true);
  assert.equal(isTextPath('package.json'), true);
  assert.equal(isTextPath('logo.png'), false);
  assert.equal(isTextPath('favicon.ico'), false);
});

test('assertTargetUsable: 已存在但为空 → 可用', async () => {
  const dir = tmp();
  const r = await assertTargetUsable(dir);
  assert.deepEqual(r, { exists: true });
});

test('cleanup', () => {
  // TPL_ROOT 只是引用避免未用告警
  assert.ok(TPL_ROOT !== undefined);
});
