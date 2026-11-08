// 脚本解释器入口：先注入内置全局函数，再导入并执行目标脚本。
//
// 为什么是子进程而不是 vm：
//   - 脚本要能 import node: 内置（fs / path / child_process…），普通 vm 上下文不支持 ESM import；
//   - 子进程顺带隔离了全局副作用与崩溃，一个脚本炸了不会带走调用方。
//
// 约定：
//   node _runner.mjs <script.mjs> [args...]
//   脚本里读 process.argv.slice(2) 拿到的就是「脚本自己的参数」，不含 runner 的噪声。
//
// 共享函数面板（服务组）：
//   环境变量 NX_SHARED_PANEL 指向 <group>.shared.mjs 时，先装载面板（「常量 = 函数 = {}」
//   整体优先执行），把它建成一个「管理空间」（namespace），再输出堆快照——
//   只输出可 JSON 表示的数据确认；函数报签名，循环引用 / 原生句柄类对象只报类型，
//   不打印内部表示（无地址、无句柄细节）。
//
// 管理空间的三种动作（env 驱动，供 core 侧用子进程调用）：
//   NX_NS_ACTION=introspect  列出空间的方法清单与状态键（管理：能干什么）
//   NX_NS_ACTION=call        调用一个方法（NX_NS_METHOD / NX_NS_ARGS_JSON）
//   NX_NS_ACTION=check       调用一个返回 bool 的方法当活性 check（执行 server 前先 check）
// 动作模式下不执行业务脚本，结果以 JSON 打到 stdout（NX_NS_RESULT 标记行）。
//
// 管理空间的常驻会话（NX_NS_SESSION=1）：
//   空间要是个「实体」，就不能每次调用都重新装载面板——那样状态每次都重置、
//   调用栈永远为空。于是这里提供会话模式：装载一次面板，然后守着 stdin，
//   每收到一行 JSON 请求（{id, action, method, args}）就在**同一个空间实例**上
//   执行一个动作，回一行 NX_NS_RESULT {id, ...}。stdin 关闭 → 进程退出。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { installAliases, ALIASES } from './aliases.mjs';
import {
  callMethod,
  describeValue,
  listMethods,
  resolvePanelSpace,
  spaceHeap,
  spaceReport,
  spaceStack,
  typeName,
} from './_ns.mjs';

const [target, ...rest] = process.argv.slice(2);

// 空间动作模式（introspect / call / check）
const nsAction = process.env.NX_NS_ACTION || '';
const nsMethod = process.env.NX_NS_METHOD || '';
const nsArgsJson = process.env.NX_NS_ARGS_JSON || '[]';

// 常驻会话模式：装载一次面板，之后靠 stdin 驱动动作
const sessionMode = process.env.NX_NS_SESSION === '1';

if (!target && !nsAction && !sessionMode) {
  console.error('用法: _runner.mjs <script.mjs> [args...]');
  process.exit(2);
}

// 全局函数先挂好：脚本被导入时就能用裸名调用它们。
const aliasNames = new Set(ALIASES.map((a) => a.name));
const beforeKeys = new Set(Object.keys(globalThis));
installAliases(globalThis);

// 共享函数面板：整体优先执行（服务组绑定，env 注入面板路径）。
const sharedPanel = process.env.NX_SHARED_PANEL;
let space = null;
if (sharedPanel) {
  const panel = await import(pathToFileURL(resolve(sharedPanel)).href);
  space = resolvePanelSpace(panel, beforeKeys, aliasNames);
  if (nsAction) {
    await runSpaceAction(space);
  } else if (sessionMode) {
    // 会话模式：先验一遍隐藏用例（面板坏在这里就该露出来），然后守着 stdin。
    await runPanelTests();
    await runSession(space);
  } else {
    dumpSharedPanelSnapshot(aliasNames, beforeKeys, panel, space);
    await runPanelTests();
  }
}

// 动作模式到此为止：不执行业务脚本。
if (nsAction) process.exit(0);
// 会话模式同样不执行业务脚本——它只托管空间。
if (sessionMode) process.exit(0);

// 让脚本看到的 argv 只有自己：argv[0]=node，argv[1]=脚本路径，之后是脚本参数。
process.argv = [process.argv[0], target, ...rest];

await import(pathToFileURL(resolve(target)).href);

// ---- 共享面板堆快照 ----
//
// 用户约定：共享面板里「常量 = 函数 = {}」，执行完成即产出数据（token、随机数组…）。
// 这里扫描 globalThis 的新增键 + 面板模块的导出，逐个给出「能被 JSON 表示」的确认输出：
//   - 可 JSON  → 打印预览（截断 240 字符）
//   - 函数     → 打印 [function name]
//   - 其余     → 只打印类型名（Map/Set/Buffer/循环引用对象…），不显示内部结构
//
// 「清理」的含义：Map / Buffer / 循环引用 / 原生句柄这类对象**不打印内部表示**——
// 里面混着地址与系统句柄，泄露出去既没用又脏；只报类型名就够了。
// __tests 是控制用的（见 runPanelTests），不进快照。
// 空间状态（显式 defineSpace 的 state）也一并列出——那是空间的「堆」。
function dumpSharedPanelSnapshot(aliasNames, beforeKeys, panel, space) {
  const added = Object.keys(globalThis).filter(
    (k) => !beforeKeys.has(k) && !aliasNames.has(k) && k !== '__tests',
  );
  // 面板模块的具名导出（export const TOKEN = …）也是「面板产出了什么」的一部分，
  // 它不一定挂在 globalThis 上——两处都收，导出优先（模块作用域才是源头）。
  const exported = panel && typeof panel === 'object' ? Object.keys(panel) : [];
  const seen = new Set();
  const entries = [];
  for (const k of exported) {
    if (k === 'default' || seen.has(k)) continue;
    seen.add(k);
    entries.push([k, panel[k]]);
  }
  for (const k of added) {
    if (seen.has(k)) continue;
    seen.add(k);
    entries.push([k, globalThis[k]]);
  }

  // 空间的方法清单：管理空间的第一问——「它到底能干什么」
  const methods = space ? listMethods(space) : [];
  console.log(
    `[shared] 共享面板已装载（${entries.length} 个导出` +
      (space ? `，空间「${space.name}」${methods.length} 个方法` : '') +
      '）：',
  );
  for (const m of methods) {
    console.log(`  · ${m.name}(${m.arity})${m.async ? ' async' : ''}`);
  }
  // 显式空间的状态（堆）单独列：它不在 globalThis 上，但确实是空间的产出
  if (space) {
    for (const [k, v] of spaceHeap(space)) {
      if (seen.has(k)) continue;
      seen.add(k);
      entries.push([k, v]);
    }
  }
  if (!entries.length) {
    console.log('[shared] （面板没有挂任何导出——数据请挂到 globalThis 或用 export 声明）');
    return;
  }
  for (const [k, v] of entries) {
    console.log(`  ${k}: ${describeValue(v)}`);
  }
}

// ---- 空间动作（introspect / call / check）----
//
// 结果统一以一行 JSON 打到 stdout，前缀 NX_NS_RESULT ——
// core 侧靠这个标记行取结构化结果，不去猜业务脚本的输出格式。
async function runSpaceAction(space) {
  const result = await handleSpaceAction(space, {
    action: nsAction,
    method: nsMethod,
    args: nsArgsJson,
  });
  console.log(`NX_NS_RESULT ${JSON.stringify(result)}`);
}

/**
 * 执行一个空间动作，返回结果对象（不负责输出）。
 * 一次性动作与常驻会话共用这一份实现——两条路的语义必须一模一样。
 */
async function handleSpaceAction(space, { action, method, args }) {
  if (action === 'introspect') {
    return {
      ok: true,
      action: 'introspect',
      space: spaceReport(space),
      methods: listMethods(space),
      heap: heapRows(space),
      frames: spaceStack(space),
    };
  }

  if (!method) {
    return { ok: false, action, error: '缺少方法名（要调用哪个方法）' };
  }

  let parsed = [];
  try {
    const v = JSON.parse(args ?? '[]');
    parsed = Array.isArray(v) ? v : [v];
  } catch (err) {
    return { ok: false, action, error: `参数不是合法 JSON: ${err?.message ?? err}` };
  }

  let value;
  try {
    value = await callMethod(space, method, parsed);
  } catch (err) {
    return {
      ok: false,
      action,
      method,
      error: err instanceof Error ? err.message : String(err),
      // 调用栈：空间方法抛错时最需要的信息（callMethod 挂在错误上）
      stack: err && typeof err === 'object' ? err.__spaceStack : undefined,
      frames: spaceStack(space),
    };
  }

  if (action === 'check') {
    // check 的契约：方法返回 bool。返回非 bool 视为不通过——宁可保守，别假装活。
    const alive = value === true;
    return {
      ok: true,
      action: 'check',
      method,
      alive,
      detail: alive
        ? `空间方法 ${method}() 返回 true`
        : `空间方法 ${method}() 返回 ${describeValue(value)}（非 true，判定不通过）`,
      frames: spaceStack(space),
    };
  }

  return {
    ok: true,
    action: 'call',
    method,
    value: toJsonSafe(value),
    // 调用后的空间状态与调用栈：空间是个实体，调用它会改变状态、也会留下调用痕迹。
    heap: heapRows(space),
    frames: spaceStack(space),
  };
}

// ---- 常驻会话 ----
//
// 一个空间实例守在进程里：core 侧发一行 JSON 请求，这里在同一空间上执行动作，
// 回一行 NX_NS_RESULT {id, ...}。stdin 关掉 → 会话结束。
// 动作串行执行（一次一个）：空间方法可能改自身状态，并发调等于自找麻烦。
async function runSession(space) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch (err) {
      writeResult({ id: null, ok: false, error: `请求不是合法 JSON: ${err?.message ?? err}` });
      continue;
    }
    const id = req?.id ?? null;
    try {
      const result = await handleSpaceAction(space, {
        action: String(req?.action ?? ''),
        method: req?.method ? String(req.method) : '',
        args: JSON.stringify(Array.isArray(req?.args) ? req.args : []),
      });
      writeResult({ id, ...result });
    } catch (err) {
      // 会话本身不能因为一次动作失败就崩掉——崩了等于空间没了。
      writeResult({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** 回一行结果给 core 侧 */
function writeResult(obj) {
  process.stdout.write(`NX_NS_RESULT ${JSON.stringify(obj)}\n`);
}

/** 堆快照的统一形态：每项给 key / 可读描述 / 类型 */
function heapRows(space) {
  return spaceHeap(space).map(([k, v]) => ({
    key: k,
    describe: describeValue(v),
    type: typeName(v),
  }));
}

// 值转 JSON：不可表示的（Map/循环引用等）换成类型描述，不抛错
function toJsonSafe(v) {
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return { __type: typeName(v) };
    return JSON.parse(s);
  } catch {
    return { __type: typeName(v), __note: '非 JSON 可表示，内部细节已清理' };
  }
}

// ---- 隐藏测试案例 ----
//
// 面板里可以放 globalThis.__tests = { '用例名': () => bool }。
// 装载完面板就跑一遍：失败只告警不阻断（面板坏了不该拖垮业务脚本），
// 通过的用例不出声——它本来就该是「隐藏」的。
async function runPanelTests() {
  const tests = globalThis.__tests;
  if (!tests || typeof tests !== 'object') return;
  const cases = Object.entries(tests).filter(([, fn]) => typeof fn === 'function');
  if (!cases.length) return;

  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      const r = await fn();
      if (r === false) {
        failed++;
        console.error(`[shared] 隐藏用例失败: ${name}`);
      }
    } catch (err) {
      failed++;
      console.error(`[shared] 隐藏用例抛错: ${name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const total = cases.length;
  if (failed === 0) {
    console.log(`[shared] 隐藏用例 ${total}/${total} 通过`);
  } else {
    console.error(`[shared] 隐藏用例 ${total - failed}/${total} 通过，${failed} 个失败`);
  }
}
