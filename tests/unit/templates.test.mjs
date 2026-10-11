// 模板引擎的单元测试。
// 这里的每一条都对应一个真实踩过/差点踩的坑，删测试前先看注释。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderString, resolveVars, listTemplates, loadTemplate } from '../../src/core/templates.js';
import { generate, walkTemplate, assertTargetUsable } from '../../src/core/generate.js';
import { applyBeforeGenerate } from '../../src/core/template-hooks.js';
import { isTextPath } from '../../src/core/skills/text-util.js';
import { sampleValues } from './sample-values.mjs';

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

test('resolveVars: 模板声明的 pattern 必须被执行（不是只有 hint 在说话）', () => {
  // 背景：std-a-lang 的 lang 早就写了 pattern，但引擎从头到尾没读过它——
  // 声明是契约，不执行就是骗模板作者，也让面板无从校验（面板与引擎各说各话）。
  const meta = {
    id: 't',
    options: [{ name: 'lang', type: 'string', pattern: '^[a-z]{2}$', hint: '两个小写字母' }],
  };
  assert.equal(resolveVars(meta, { lang: 'ts' }).lang, 'ts');
  assert.throws(() => resolveVars(meta, { lang: 'TS' }), /格式不对/);
  assert.throws(() => resolveVars(meta, { lang: '../evil' }), /格式不对/);
  assert.throws(() => resolveVars(meta, { lang: 'ts, go' }), /格式不对/, '多值要由 pattern 自己开口子');

  // std-a-lang 的真 pattern 开口子给多语言：引擎照它的意思办，钩子再去拆列表
  const multi = {
    id: 'multi',
    options: [
      {
        name: 'lang',
        type: 'string',
        pattern: '^[a-z][a-z0-9_]{1,8}(\\s*,\\s*[a-z][a-z0-9_]{1,8})*$',
      },
    ],
  };
  assert.equal(resolveVars(multi, { lang: 'ts, go, py' }).lang, 'ts, go, py');
});

test('resolveVars: 模板库里的 pattern 全部编译得过（readTemplateMeta 的前置闸门）', async () => {
  // loadTemplate 只认仓库内的 templates/，临时目录造不出「坏模板」；
  // 于是这条改为钉住同一件事的行为面：真模板库里没有编译不过的 pattern。
  const { templates, errors } = await listTemplates();
  assert.deepEqual(errors, [], '模板库里有 pattern 编译不过的模板');
  for (const meta of templates) {
    for (const opt of meta.options || []) {
      if (opt.pattern) assert.doesNotThrow(() => new RegExp(opt.pattern), `${meta.id}.${opt.name}`);
    }
  }
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

test('isTextPath: 按扩展名分流（文本会被渲染，其余按二进制原样拷贝）', () => {
  // 文本侧：占位符会被替换
  assert.equal(isTextPath('src/a.jsx'), true);
  assert.equal(isTextPath('package.json'), true);
  assert.equal(isTextPath('Makefile'), true, '无扩展名视为文本');
  assert.equal(isTextPath('.gitignore'), true, '点文件视为文本');
  // 非 JS 生态：mono-gf 模板踩过这一条 —— 漏了扩展名不会报错，
  // 只会让生成的产物里字面留着占位符（静默坏掉）
  assert.equal(isTextPath('app/server/main.go'), true, 'Go 源码');
  assert.equal(isTextPath('go.mod'), true, 'go module 文件');
  assert.equal(isTextPath('db/schema.sql'), true, 'SQL');
  assert.equal(isTextPath('web/nginx.conf'), true, 'nginx 配置');
  assert.equal(isTextPath('.env.example'), true, 'env 模板');
  // 二进制侧：必须原样拷贝，否则会被 utf8 读写损坏
  assert.equal(isTextPath('logo.png'), false);
  assert.equal(isTextPath('favicon.ico'), false);
});

test('assertTargetUsable: 已存在但为空 → 可用', async () => {
  const dir = tmp();
  const r = await assertTargetUsable(dir);
  assert.deepEqual(r, { exists: true });
});

test('模板库全部文本文件都能渲染（占位符写错只会在生成期才炸，这里提前红）', async () => {
  // 背景：生成期的 renderString 遇到「未声明的变量」直接抛错，而模板文件里
  // 每一次双花括号都会被当成变量。反面教材是 ESLint 的 messages/messageId 插值
  // ——它的语法恰好也是双花括号，写进模板文件会让 `template create` 当场失败
  // （smoke 只 dry-run 了 JS 模板，TS 模板没人兜）。
  // 变量按模板自己的 option schema 派生，新增 option 自动覆盖。
  // 样例值必须合法（type / values / pattern 都要过），否则这条长跑测试会因为
  // 模板自己的校验而红，而它想验的根本不是校验规则。
  //
  // 例外：安装期占位符由 skill 安装钩子（hooks.json → install handler）注入，
  // 生成期刻意不认它。渲染前先中和掉，否则这条测试会把「设计如此」当成失败。
  const INSTALL_TIME_PLACEHOLDERS = ['PROJECT_ROOT'];
  const { templates } = await listTemplates();
  assert.ok(templates.length >= 1);
  for (const meta of templates) {
    const values = sampleValues(meta);
    const vars = resolveVars(meta, values);
    const filesDir = join(TPL_ROOT, meta.id, 'files');
    for (const rel of await walkTemplate(filesDir)) {
      const raw = readFileSync(join(filesDir, rel));
      if (!isTextPath(rel)) {
        // 非文本文件会被**原样拷贝**：里面若含占位符，就会字面留在生成产物里。
        // 这是静默失败（不报错、产物坏），所以宁可在这里拦死。
        assert.ok(
          !raw.includes('{{'),
          `${meta.id}/${rel} 不是文本扩展名（isTextPath=false）却含占位符：` +
            '生成时会原样拷贝、字面留下花括号。请把该扩展名补进 core/skills/text-util.ts 的 TEXT_EXT。'
        );
        continue;
      }
      let src = raw.toString('utf8');
      for (const name of INSTALL_TIME_PLACEHOLDERS) {
        src = src.split(`{{${name}}}`).join(name);
      }
      assert.doesNotThrow(
        () => renderString(src, vars),
        `${meta.id}/${rel} 渲染失败（多半是写了一个不是变量的双花括号占位符）`
      );
    }
  }
});

test('std-a-lang 列表变量展开：单/多语言都铺到父目录，不嵌套（v0.6.3 钉）', async () => {
  // 背景：files/a_{{lang}}/{...} 的 {{lang}} 是**列表变量**——引擎在 core/generate.ts
  // 的 listVarExpansions 里看到 vars.lang 是数组就把整棵子树复制 N 份，副本里的
  // {{lang}} 用各元素的标量值替换。
  //   - 单 lang：父目录里只生 a_ts/；
  //   - 多 lang：父目录里平级生 a_ts/ a_go/。
  // 此前的「母版-复制」钩子方案（v0.6.0~0.6.2）会因 files/a_{{lang}}/ + 输出目录默认 a_ts
  // 而生成 a_ts/a_ts/ 双层——这条钉死新方案的不嵌套形状。
  const { meta, dir } = await loadTemplate('std-a-lang');
  const baseCtx = { probePort: async () => true, probePorts: async () => [8000] };

  // 单 lang：父目录里只生 a_ts/，禁止 a_ts/a_ts/ 嵌套
  const parent1 = mkdtempSync(join(tmpdir(), 'nxnx-stdalang-single-'));
  const v1 = await applyBeforeGenerate(dir, resolveVars(meta, { lang: 'ts' }), { ...baseCtx, cwd: tmp(), dir: parent1 });
  await generate({ templateDir: dir, targetDir: parent1, vars: v1 });
  assert.equal(existsSync(join(parent1, 'a_ts', 'doc', 'README.md')), true, '四象限必须在 a_ts/ 下');
  assert.equal(existsSync(join(parent1, 'a_ts', 'sdk', '.gitkeep')), true);
  assert.equal(existsSync(join(parent1, 'a_ts', 'a_ts')), false, '禁止 a_ts/a_ts 嵌套');
  // 文本里的 {{lang}} 用副本标量替换：a_ts/doc/README.md 的标题应是 a_ts · ts
  assert.match(
    readFileSync(join(parent1, 'a_ts', 'doc', 'README.md'), 'utf8'),
    /^# a_ts · ts$/m,
    '副本内文本用各副本的标量值替换',
  );

  // 多 lang：父目录里 a_ts/ a_go/ 平级；没有多生 a_py/
  const parent2 = mkdtempSync(join(tmpdir(), 'nxnx-stdalang-multi-'));
  const v2 = await applyBeforeGenerate(
    dir,
    resolveVars(meta, { lang: 'ts, go' }),
    { ...baseCtx, cwd: tmp(), dir: parent2 },
  );
  await generate({ templateDir: dir, targetDir: parent2, vars: v2 });
  assert.equal(existsSync(join(parent2, 'a_ts', 'doc', 'README.md')), true);
  assert.equal(existsSync(join(parent2, 'a_go', 'sdk', '.gitkeep')), true);
  assert.equal(existsSync(join(parent2, 'a_py')), false, '没有 py 就别生 a_py/');
  assert.match(readFileSync(join(parent2, 'a_go', 'doc', 'README.md'), 'utf8'), /^# a_go · go$/m);

  // 缺 --dir：钩子当场拒（不拖到写盘才发现目录嵌错）
  await assert.rejects(
    () => applyBeforeGenerate(dir, resolveVars(meta, { lang: 'ts, go' }), baseCtx),
    /空目录/,
  );
  // 单 lang 也必须给 --dir——siblings 模板的语义统一
  await assert.rejects(
    () => applyBeforeGenerate(dir, resolveVars(meta, { lang: 'ts' }), baseCtx),
    /空目录/,
  );
});

test('cleanup', () => {
  // TPL_ROOT 只是引用避免未用告警
  assert.ok(TPL_ROOT !== undefined);
});
