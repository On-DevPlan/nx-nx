// 生成各模块的 action 清单：
//   node --import tsx scripts/gen-actions.mjs
//
// 做什么：扫 src/modules/<域>/actions/*.ts，把每个文件的 **default 导出**
// （一条 action）收进 src/modules/<域>/actions/_manifest.generated.ts。
// 模块装配只读这份清单——于是「加一条 action」= 新建一个文件 + 跑一次生成，
// 模块 index.ts 一行都不用改。
//
// 为什么是生成而不是运行时扫目录：
//   - 运行时扫描要动态 import 每个文件，而模块的装配是**同步**的
//     （注册表在 import 期建好），动态 import 是异步的 → 只能上 TLA
//     （顶层 await），那会让整个注册表变成异步初始化，牵动 CLI/HTTP/server 三条链；
//   - 生成物有**新鲜度对账测试**兜底（改了声明忘了生成 → 当场红），
//     而运行时扫描没有这个「可被钉住」的边界；
//   - 生成的清单是**静态 import**，打包与类型检查都能看见（运行时扫描看不见）。
//
// 收集规则：文件导出 default 且它带 id / cli → 收；其余导出忽略。
//
// 写盘策略：内容一样就不落盘。无谓重写会让每次 `pnpm test`（链里含 gen）
// 都刷新生成物的 mtime：编辑器的文件监听据此重扫工作区，tsc 的增量缓存失效。
//
// 本文件同时**导出** generateActionManifests()——新鲜度对账测试靠它
// 「现场重生成一遍再逐字比对」，而不是真去写盘（测试不污染工作区）。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');

const HEADER = `// AUTO-GENERATED —— 由 scripts/gen-actions.mjs 生成，勿手改。
//
// 收录本目录下每个文件的 default 导出（一条 action 一个文件）。
// **加一条 action = 新建一个文件 + 跑 \`pnpm gen\`**；模块的 index.ts 不需要改。
// 新鲜度由 tests/unit/gen-freshness.test.mjs 对账。

`;

/** 把 kebab-case 的文件名转成合法的 TS 标识符。 */
function identOf(file) {
  const base = file.replace(/\.ts$/, '');
  const camel = base.replace(/[-_](\w)/g, (_m, c) => c.toUpperCase());
  return /^[A-Za-z_$][\w$]*$/.test(camel) ? camel : `action_${base.replace(/\W/g, '_')}`;
}

/** 一份生成物：相对仓库根的路径 + 文件内容。 */
// @typedef {{ path: string; body: string }} GeneratedManifest

/**
 * 现场算出各模块的 action 清单内容（不写盘）。
 * 返回清单与发现的问题——问题非空说明有 action 声明不合格。
 */
export async function generateActionManifests(root = ROOT) {
  const modulesDir = join(root, 'src', 'modules');
  /** @type {GeneratedManifest[]} */
  const manifests = [];
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string,string>} */
  const seenIds = new Map();

  for (const moduleDir of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!moduleDir.isDirectory()) continue;
    const actionsDir = join(modulesDir, moduleDir.name, 'actions');
    if (!existsSync(actionsDir)) continue;

    const files = readdirSync(actionsDir)
      .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
      .sort();

    /** @type {{file:string; ident:string; id:string}[]} */
    const entries = [];
    for (const file of files) {
      const mod = await import(pathToFileURL(join(actionsDir, file)).href);
      const action = mod.default;
      if (!action || typeof action !== 'object') {
        problems.push(`${moduleDir.name}/${file}: 没有 default 导出的 action`);
        continue;
      }
      if (typeof action.id !== 'string' || !action.id) {
        problems.push(`${moduleDir.name}/${file}: action 缺 id`);
        continue;
      }
      if (!action.cli) {
        problems.push(`${moduleDir.name}/${file}: action ${action.id} 没声明 cli`);
        continue;
      }
      if (action.http !== null && action.http !== undefined && !Array.isArray(action.http)) {
        problems.push(`${moduleDir.name}/${file}: action ${action.id} 的 http 必须是路由数组或 null`);
        continue;
      }
      const prev = seenIds.get(action.id);
      if (prev) {
        problems.push(`action id 重复: ${action.id}（${prev} 与 ${moduleDir.name}/${file}）`);
        continue;
      }
      seenIds.set(action.id, `${moduleDir.name}/${file}`);
      entries.push({ file, ident: identOf(file), id: action.id });
    }

    const imports = entries
      .map((e) => `import ${e.ident} from './${e.file.replace(/\.ts$/, '')}.js';`)
      .join('\n');
    const list = entries.map((e) => `  ${e.ident},`).join('\n');
    const reexports = entries.map((e) => `export { ${e.ident} };`).join('\n');
    const body = `${HEADER}${imports}

/**
 * 本模块的全部 action。
 *
 * as const：保留字面量元组形状——注册表的编译期查重（重复 id / CLI 路径 / 路由）
 * 依赖它，丢了就只剩运行时兜底。
 */
export const ACTIONS = [
${list}
] as const;

${reexports}
`;
    manifests.push({
      path: relative(root, join(actionsDir, '_manifest.generated.ts')).replace(/\\/g, '/'),
      body,
    });
  }

  return { manifests, problems };
}

/** 内容一样就不落盘（见文件头注）。 */
function writeIfChanged(abs, body) {
  if (existsSync(abs) && readFileSync(abs, 'utf8') === body) return false;
  writeFileSync(abs, body, 'utf8');
  return true;
}

async function main() {
  const { manifests, problems } = await generateActionManifests(ROOT);
  let total = 0;
  for (const m of manifests) {
    const abs = join(ROOT, m.path);
    const changed = writeIfChanged(abs, m.body);
    const count = (m.body.match(/^  \w+,$/gm) || []).length;
    total += count;
    console.log(`gen:actions — ${m.path}: ${count} 条 action${changed ? '' : '（无变化）'}`);
  }
  if (problems.length) {
    console.error('\ngen:actions — 发现问题:');
    for (const p of problems) console.error('  ' + p);
    process.exitCode = 1;
    return;
  }
  console.log(`gen:actions — 共 ${total} 条 action`);
}

// 直接运行时才写盘；被 import（测试）时只提供函数。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
