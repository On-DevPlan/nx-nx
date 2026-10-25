// 脚本：批量把各 nx 项目的随包 skill 强制覆盖安装到本机 skill 目录。
//
// 场景：D:\code\a_js\proj 下有一排 nx-* 项目，每个项目的 assets/ 里带着自己的
// skill 文档；模板基本固定 → skill 文档改过之后，要能一条命令把本机装的那份
// 全量刷新掉（强制覆盖，不留旧文件）。
//
// 用法：
//   node assets/scripts/sync-nx-skills.mjs --root D:\code\a_js\proj
//   nx-nx script run sync-nx-skills --root D:\code\a_js\proj --to ~/.claude/skills
//
// 自己装，不借各项目的 bin：
//   安装规则是确定的（就三步），所以直接按规则做，不去调每个项目的安装器，
//   也就不会为 9 个项目起 9 个子进程——整个脚本是纯文件操作。
//
//   1. 源 = <项目>/assets/<skill>/，目标 = <安装目录>/<skill>/；
//   2. 强制覆盖：目标目录先删后拷（改过名的旧文件不会残留）；
//   3. 两样东西不装：hooks.json 与 install/ —— 它们是「安装期资产」，
//      只对安装器有意义，不是 skill 文档的一部分；
//      另外把文本里的 {{PROJECT_ROOT}} / {{NX_NX_ROOT}} 渲染成项目根全路径
//      （各项目安装器的钩子干的就是这件事，规则固定，这里自己实现）。
import { basename, join, resolve } from 'node:path';
import { installAliases } from './aliases.mjs';

installAliases(globalThis);

const argv = parseArgs(process.argv.slice(2));
const flags = argv.flags;

const root = resolve(String(flags.root ?? process.cwd()));
const to = resolve(String(flags.to ?? join(homeDir(), '.claude', 'skills')));
const depth = Number(flags.depth ?? 1);
const filter = flags.filter ? String(flags.filter) : '';
const dry = Boolean(flags.dry);

// ---- 文本文件判定（决定「{{占位符}} 渲染」还是「按二进制原样拷贝」）--------
// 漏一个扩展名的后果不是报错，而是产物里留着字面 {{PROJECT_ROOT}}（静默坏掉）。
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt',
  '.css', '.html', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.sh',
  '.go', '.mod', '.sum', '.sql', '.conf', '.example', '.dockerignore',
  '.gitignore', '.npmrc', '.env', '.editorconfig', '',
]);

function isTextPath(rel) {
  const name = basename(rel);
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot).toLowerCase();
  return TEXT_EXT.has(ext) || /\.(gitignore|npmrc|editorconfig)$/.test(name);
}

// 只替换 vars 里有的占位符，其余原样——skill 文档里可能有示例花括号，
// 不该被渲染机制误伤。
function renderVars(text, vars) {
  return text.replace(/\{\{([\w-]+)\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

// ---- 发现：哪些目录是「带 skill 的项目」 --------------------------------

async function skillsOf(projectDir) {
  const assets = join(projectDir, 'assets');
  const out = [];
  for (const e of await listEntries(assets)) {
    if (!e.isDir) continue;
    if (!isFile(join(assets, e.name, 'SKILL.md'))) continue;
    out.push(e.name);
  }
  return out.sort();
}

// 一个「项目」= 有 package.json 且 assets/ 下至少有一个含 SKILL.md 的子目录。
async function isProject(dir) {
  if (!isFile(join(dir, 'package.json'))) return false;
  return (await skillsOf(dir)).length > 0;
}

async function discover() {
  const found = [];
  async function scan(dir, level) {
    if (await isProject(dir)) found.push(dir);
    if (level >= depth) return;
    for (const e of await listEntries(dir)) {
      if (!e.isDir) continue;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      await scan(join(dir, e.name), level + 1);
    }
  }
  await scan(root, 0);
  return found;
}

// ---- 装 ------------------------------------------------------------------

// 项目根 → 渲染用的变量。统一正斜杠：Windows 下 node 与 git 都接受，文档里也更稳。
function varsOf(projectDir) {
  const rootPosix = projectDir.replace(/\\/g, '/');
  return { PROJECT_ROOT: rootPosix, NX_NX_ROOT: rootPosix };
}

// 强制覆盖装一个 skill：目标先删后拷；跳过安装期资产；文本渲染 vars。
async function installSkill(projectDir, toDir, name, vars) {
  const src = join(projectDir, 'assets', name);
  const dst = join(toDir, name);
  if (dry) return { files: 0, skipped: false };

  await removePath(dst);
  await mkdirp(dst);
  let files = 0;
  async function rec(from, toDirNow, rel) {
    for (const e of await listEntries(from)) {
      if (e.name === 'hooks.json' || e.name === 'install') continue;
      const s = join(from, e.name);
      const d = join(toDirNow, e.name);
      const childRel = rel ? rel + '/' + e.name : e.name;
      if (e.isDir) {
        await mkdirp(d);
        await rec(s, d, childRel);
      } else if (e.isFile) {
        if (isTextPath(childRel)) {
          await writeText(d, renderVars(await readText(s), vars));
        } else {
          await copyFile(s, d);
        }
        files++;
      }
    }
  }
  await rec(src, dst, '');
  return { files, skipped: false };
}

// ---- 主流程 --------------------------------------------------------------

heading(`同步 nx 项目的 skill → ${to}`);
log(`扫描根目录: ${root}${dry ? '（dry-run，不写盘）' : ''}`);

const projects = await discover();
if (!projects.length) {
  warn(`没有找到带 skill 的项目（根目录: ${root}）`);
  process.exit(0);
}

const rows = [];
let totalFiles = 0;

for (const dir of projects) {
  const name = String(dir.split(/[\\/]/).pop());
  if (filter && !name.includes(filter)) continue;
  const skills = await skillsOf(dir);
  const vars = varsOf(dir);
  let files = 0;
  for (const s of skills) {
    const r = await installSkill(dir, to, s, vars);
    files += r.files;
  }
  totalFiles += files;
  rows.push({ 项目: name, skill: skills.length, 文件: files, 目标: join(to, name) });
}

table(rows);

log('');
log(
  `项目 ${rows.length} 个 · skill ${rows.reduce((n, r) => n + Number(r.skill || 0), 0)} 个` +
    ` · 文件 ${totalFiles} 个 · 目标 ${to}`,
);
log('（强制覆盖：目标目录已先删后拷；hooks.json 与 install/ 不随安装走）');
