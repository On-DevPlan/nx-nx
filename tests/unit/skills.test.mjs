// 随包 skill 系统的单元测试：发现、分组、安装、导出与降级路径。
// 经 tsx 跑 src；安装目标一律用临时目录，绝不碰真实 ~/.claude/skills。
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundledSkillNames,
  loadGroups,
  installOne,
  installGroup,
} from '../../src/core/skills/index.js';
import { getSkill, listRefs } from '../../src/core/skills/get.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'nxnx-skill-'));
}

// 构造一棵最小资产树：assets/<name>/SKILL.md
function seedAssets(root, names) {
  for (const n of names) {
    mkdirSync(join(root, n, 'references'), { recursive: true });
    writeFileSync(join(root, n, 'SKILL.md'), `# ${n}\n内容 {{name}}\n`);
  }
}

beforeEach(() => {
  delete process.env.NX_NX_ASSETS;
});
afterEach(() => {
  delete process.env.NX_NX_ASSETS;
});

test('bundledSkillNames: 含主 skill 与 nx-dev', async () => {
  const names = await bundledSkillNames();
  assert.deepEqual(names, ['nx-dev', 'nx-nx']);
});

test('loadGroups: manifest 驱动，默认 group = nx-nx，nx-dev 组含两个 skill', async () => {
  const m = await loadGroups();
  assert.equal(m.source, 'manifest');
  assert.equal(m.defaultGroup, 'nx-nx');
  assert.deepEqual(m.groups['nx-nx'].skills, ['nx-nx']);
  assert.deepEqual(m.groups['nx-dev'].skills, ['nx-nx', 'nx-dev']);
});

test('installOne: 首次安装 → ok；再次安装 → skipped；无差异时 force 仍 skipped', async () => {
  const to = tmp();
  const first = await installOne('nx-dev', { to });
  assert.equal(first.status, 'ok');
  assert.equal(first.installed, true);
  assert.ok(first.files > 0);

  const second = await installOne('nx-dev', { to });
  assert.equal(second.status, 'skipped');
  assert.equal(second.files, 0);

  const forced = await installOne('nx-dev', { to, force: true });
  assert.equal(forced.status, 'skipped');
});

test('installOne: 已存在且有差异、无 force → conflict', async () => {
  const root = tmp();
  seedAssets(root, ['demo']);
  process.env.NX_NX_ASSETS = root;
  const to = tmp();
  await installOne('demo', { to });
  // 改动源文件制造差异
  writeFileSync(join(root, 'demo', 'SKILL.md'), '# demo\n变更\n');
  const r = await installOne('demo', { to });
  assert.equal(r.status, 'conflict');
  assert.ok(r.files >= 1);

  // force 覆盖差异文件
  const replaced = await installOne('demo', { to, force: true });
  assert.equal(replaced.status, 'ok');
  assert.equal(replaced.replaced, true);
});

test('installOne: 未知 skill 报 NOT_FOUND 并给出可用列表', async () => {
  await assert.rejects(() => installOne('ghost', { to: tmp() }), (err) => {
    assert.equal(err.code, 'NOT_FOUND');
    assert.match(err.message, /nx-dev/);
    return true;
  });
});

test('installGroup: nx-dev 组一次装齐两个；未知 group 报 INVALID_INPUT', async () => {
  const to = tmp();
  const r = await installGroup('nx-dev', { to });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.skills.map((x) => x.name).sort(), ['nx-dev', 'nx-nx']);

  const again = await installGroup('nx-dev', { to });
  assert.ok(again.skills.every((x) => x.status === 'skipped'));

  await assert.rejects(() => installGroup('bogus', { to }), (err) => {
    assert.equal(err.code, 'INVALID_INPUT');
    assert.match(err.message, /nx-dev/);
    return true;
  });
});

test('installGroup: 组内有冲突且未 force → 整体 conflict、不落新文件', async () => {
  const root = tmp();
  seedAssets(root, ['a', 'b']);
  writeFileSync(
    join(root, 'groups.json'),
    JSON.stringify({ groups: { g: { skills: ['a', 'b'] } } }),
  );
  process.env.NX_NX_ASSETS = root;
  const to = tmp();
  await installOne('a', { to });
  writeFileSync(join(root, 'a', 'SKILL.md'), '# a\n变\n');
  const r = await installGroup('g', { to });
  assert.equal(r.status, 'conflict');
  assert.equal(r.skills.length, 1); // 只有 a 冲突；b 尚未安装也不被装入
  assert.ok(!existsSync(join(to, 'b')));
});

test('getSkill: 默认 skill 返回全文与安装状态；ref 可解析', async () => {
  const to = tmp();
  const r = await getSkill('nx-dev', { to });
  assert.equal(r.skillName, 'nx-dev');
  assert.equal(r.ref, 'SKILL.md');
  assert.ok(r.contentBytes > 100);
  assert.match(r.content, /nx-dev/);
  assert.equal(r.install.status, 'ok');

  const refs = await listRefs('nx-dev');
  assert.deepEqual(refs, ['50-template-authoring', '51-verification-loop', '52-hook-bus']);

  const r2 = await getSkill('nx-dev', { ref: '50-template-authoring', to });
  assert.equal(r2.ref, 'references/50-template-authoring.md');
  assert.ok(r2.content.includes('template.json'));
});

test('getSkill: 未知 ref 与含 .. 的 ref 被拒', async () => {
  await assert.rejects(() => getSkill('nx-dev', { ref: 'nope', to: tmp() }), (err) => {
    assert.equal(err.code, 'INVALID_INPUT');
    return true;
  });
  await assert.rejects(
    () => getSkill('nx-dev', { ref: '../groups.json', to: tmp() }),
    (err) => {
      assert.equal(err.code, 'INVALID_INPUT');
      return true;
    },
  );
});

test('降级：无 groups.json → 目录扫描；损坏 JSON → 扫描 + warning', async () => {
  const root = tmp();
  seedAssets(root, ['x']);
  process.env.NX_NX_ASSETS = root;
  const m1 = await loadGroups();
  assert.equal(m1.source, 'assets-dirs');
  assert.deepEqual(Object.keys(m1.groups), ['x']);

  writeFileSync(join(root, 'groups.json'), '{ not json');
  const m2 = await loadGroups();
  assert.equal(m2.source, 'assets-dirs');
  assert.match(m2.warning, /降级/);
});

test('降级不兜底 schema 错误：groups 缺 skills 抛 specError', async () => {
  const root = tmp();
  seedAssets(root, ['x']);
  writeFileSync(join(root, 'groups.json'), JSON.stringify({ groups: { x: {} } }));
  process.env.NX_NX_ASSETS = root;
  await assert.rejects(() => loadGroups(), /group "x"/);
});

// ---- pre/post install 钩子与动态字符串 ----

test('带钩子 skill：vars 渲染、未知占位保留、post 触发、安装期资产不复制', async () => {
  const root = tmp();
  const src = join(root, 'hooked');
  const inst = join(src, 'install');
  mkdirSync(inst, { recursive: true });
  writeFileSync(join(src, 'SKILL.md'), '---\nname: hooked\n---\nroot={{ROOT}} keep={{OTHER}}');
  const marker = join(root, 'post.marker');

  writeFileSync(
    join(inst, 'pre.mjs'),
    [
      'export default async function pre(p) {',
      '  return { vars: { ROOT: p.cwd.replace(/\\\\/g, "/") } };',
      '}',
    ].join('\n')
  );
  writeFileSync(
    join(inst, 'post.mjs'),
    [
      "import { writeFileSync } from 'node:fs';",
      `export default async function post(p) { writeFileSync(${JSON.stringify(marker)}, p.vars.ROOT || ''); }`,
    ].join('\n')
  );
  writeFileSync(
    join(src, 'hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        'skill:pre-install': [
          { match: '^hooked$', hooks: [{ type: 'module', use: './install/pre.mjs' }] },
        ],
        'skill:post-install': [
          { match: '^hooked$', hooks: [{ type: 'module', use: './install/post.mjs' }] },
        ],
      },
    })
  );
  process.env.NX_NX_ASSETS = root;

  const to = mkdtempSync(join(tmpdir(), 'sk-hooked-'));
  const r = await installOne('hooked', { to });
  assert.equal(r.status, 'ok');

  const skill = readFileSync(join(to, 'hooked', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes(`root=${process.cwd().replace(/\\/g, '/')}`));
  assert.ok(skill.includes('keep={{OTHER}}'), '未提供的占位符应原样保留');
  assert.ok(!existsSync(join(to, 'hooked', 'hooks.json')), 'hooks.json 不复制');
  assert.ok(!existsSync(join(to, 'hooked', 'install')), 'install/ 不复制');
  assert.ok(existsSync(marker), 'post-install 应被触发');
  assert.equal(readFileSync(marker, 'utf8'), process.cwd().replace(/\\/g, '/'));
});

test('nx-dev handler：非仓库 cwd block，仓库 cwd 返回全路径', async () => {
  delete process.env.NX_NX_ASSETS;
  const checkRoot = (await import('../../assets/nx-dev/install/check-root.mjs')).default;

  const bad = await checkRoot({ cwd: tmpdir() });
  assert.ok(bad.block, '应返回 block');
  assert.match(bad.block, /只能在 nx-nx 仓库/);

  const ok = await checkRoot({ cwd: process.cwd() });
  assert.deepEqual(ok.vars, { NX_NX_ROOT: process.cwd().replace(/\\/g, '/') });
});

test('installOne nx-dev：仓库根安装注入真实路径、无占位残留', async () => {
  delete process.env.NX_NX_ASSETS;
  const to = mkdtempSync(join(tmpdir(), 'sk-nxdev-real-'));
  const r = await installOne('nx-dev', { to });
  assert.equal(r.status, 'ok');

  const skill = readFileSync(join(to, 'nx-dev', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes(process.cwd().replace(/\\/g, '/')), '应注入仓库全路径');
  assert.ok(!skill.includes('{{NX_NX_ROOT}}'), '不应残留占位符');
  assert.ok(!existsSync(join(to, 'nx-dev', 'install-hooks.mjs')));
});

test('installGroup nx-dev：错误 cwd 下整组拒绝', async () => {
  delete process.env.NX_NX_ASSETS;
  const oldCwd = process.cwd();
  process.chdir(tmpdir());
  try {
    const to = mkdtempSync(join(tmpdir(), 'sk-grp-block-'));
    await assert.rejects(() => installGroup('nx-dev', { to }), /只能在 nx-nx 仓库/);
  } finally {
    process.chdir(oldCwd);
  }
});
