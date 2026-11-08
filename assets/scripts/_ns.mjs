// 命名空间运行时（namespace runtime）——「空间」的可管理运行时。
//
// 为什么不是「一段脚本」：
//   脚本是一次性执行完就散的代码；空间是一段被「装载 + 管理」的世界——
//   它有名字、有状态（堆）、有方法（可列举 / 可调用 / 可重定义）、有调用栈记录。
//   启动按钮对应一个空间：服务组启动与流水线会先问这个空间「活没活」。
//
// 空间有两种来源：
//   1) 显式：面板导出 defineSpace({ name, description, state, methods }) —— 推荐
//   2) 隐式：面板只往 globalThis 挂东西 —— 自动合成为空间
//      （非函数键算状态，函数键算方法），老面板零改造即可被管理
//
// 硬约束（同 aliases.mjs）：本文件只依赖 node: 内置，绝不 import 任何 nx-nx 源码。
// core 侧通过子进程调用本模块提供的能力（见 src/core/service/namespace.ts）。

// ---- 空间注册表（进程内）----
// 一个进程只装载一个面板；跨进程的索引由 core 侧维护。
const registry = new Map();

// 空间对象的标记：core 侧靠它识别「这是空间，不是普通模块」
const SPACE_MARK = '__isNamespace';

/**
 * 定义一个管理空间。
 * @param {{name:string, description?:string, state?:object, methods?:object}} spec
 */
export function defineSpace(spec) {
  const src = spec && typeof spec === 'object' ? spec : {};
  const name = String(src.name ?? '').trim();
  if (!name) throw new Error('defineSpace: 缺少 name');
  if (registry.has(name)) throw new Error(`defineSpace: 空间 ${name} 已存在`);

  const space = {
    [SPACE_MARK]: true,
    name,
    description: String(src.description ?? ''),
    state: { ...(src.state ?? {}) },
    methods: new Map(),
    stack: [], // 方法调用栈记录（每次调用一帧）
  };

  for (const [key, fn] of Object.entries(src.methods ?? {})) {
    if (typeof fn !== 'function') throw new Error(`defineSpace(${name}): 方法 ${key} 不是函数`);
    space.methods.set(key, fn);
  }
  registry.set(name, space);
  return space;
}

/** 空间是否已注册（core 侧与 runner 共用的判定口径） */
export function isSpace(v) {
  return Boolean(v && typeof v === 'object' && v[SPACE_MARK] === true);
}

/** 列出全部空间名 */
export function listSpaces() {
  return [...registry.keys()];
}

/** 取空间；不存在返回 undefined */
export function getSpace(name) {
  return registry.get(String(name ?? ''));
}

/**
 * 列出空间的方法清单：名字 / 参数个数 / 是否 async。
 * 方法管理的第一问——「这个空间到底能干什么」。
 */
export function listMethods(space) {
  if (!space) return [];
  return [...space.methods.entries()].map(([name, fn]) => ({
    name,
    arity: typeof fn === 'function' ? fn.length : 0,
    async: typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction',
  }));
}

/**
 * 调用空间方法：返回值原样透出，调用栈记进 space.stack。
 * 抛错不吞——调用方要看到真实错误。
 */
export async function callMethod(space, methodName, args = []) {
  if (!space) throw new Error('空间不存在');
  const fn = space.methods.get(String(methodName ?? ''));
  if (typeof fn !== 'function') {
    const known = [...space.methods.keys()].join(', ') || '(无)';
    throw new Error(`空间 ${space.name} 没有方法 ${methodName}（可用: ${known}）`);
  }
  const frame = {
    method: String(methodName),
    at: new Date().toISOString(),
    stack: captureStack(),
  };
  space.stack.push(frame);
  try {
    const value = await fn(...args);
    frame.resultType = typeName(value);
    return value;
  } catch (err) {
    frame.error = err instanceof Error ? err.message : String(err);
    // 把调用栈挂到错误上：排错时最缺的就是「从哪儿调进去的」。
    // 不覆盖原错误对象（可能是非 Error），用附加字段的方式。
    if (err && typeof err === 'object' && !Array.isArray(err)) {
      try {
        Object.defineProperty(err, '__spaceStack', {
          value: frame.stack,
          enumerable: false,
          configurable: true,
        });
      } catch {
        // 冻结的对象加不了字段——不影响主流程
      }
    }
    throw err;
  } finally {
    // 栈只留最近若干帧：空间是长驻的，无界增长会把内存吃光
    if (space.stack.length > 50) space.stack.shift();
  }
}

/** 空间的堆快照：状态里每个值的可读描述 */
export function spaceHeap(space) {
  if (!space) return [];
  return Object.entries(space.state).map(([k, v]) => [k, v]);
}

/**
 * 空间的调用栈：方法被调用过的记录（每次调用一帧）。
 * 这是「空间有调用栈」的可见面——调用成功后也能看到从哪儿调进去的，
 * 不只在抛错时才给栈。
 */
export function spaceStack(space) {
  if (!space) return [];
  return space.stack.map((f) => ({
    method: f.method,
    at: f.at,
    resultType: f.resultType ?? null,
    error: f.error ?? null,
    frames: Array.isArray(f.stack) ? f.stack.slice(0, 8) : [],
  }));
}

/** 空间报告：可 JSON 表示的完整视图（core 侧落盘成索引） */
export function spaceReport(space) {
  if (!space) return null;
  return {
    name: space.name,
    description: space.description,
    methods: listMethods(space),
    stateKeys: Object.keys(space.state),
    stackDepth: space.stack.length,
  };
}

// ---- 装载面板 → 得到空间 ----

/**
 * 从一个已 import 的面板模块里取出空间：
 *   显式空间（default / SPACE 导出）优先；没有则按 globalThis 增量合成。
 *   两种风格可以混用——显式空间声明 methods 的同时，往 globalThis 挂的函数
 *   也会被并进来（面板作者常常一边 defineSpace 一边顺手挂几个 helper）。
 * @param {object} mod 面板模块
 * @param {string[]} beforeKeys 装载面板之前 globalThis 的键
 * @param {Set<string>} aliasNames 内置全局函数名（不算面板的产出）
 */
export function resolvePanelSpace(mod, beforeKeys, aliasNames) {
  const explicit = [mod?.default, mod?.SPACE, mod?.space].find((c) => isSpace(c));
  const space = explicit ?? defineSpace({ name: 'panel' });

  // globalThis 的新增键：函数 → 方法，其余 → 状态
  for (const key of Object.keys(globalThis)) {
    if (beforeKeys.has(key) || aliasNames.has(key) || key === '__tests') continue;
    const v = globalThis[key];
    if (typeof v === 'function') {
      if (!space.methods.has(key)) space.methods.set(key, v);
    } else if (!(key in space.state)) {
      space.state[key] = v;
    }
  }
  return space;
}

// ---- 值描述（堆快照的输出形态）----

/** 类型名（不泄露内部结构） */
export function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const c = v?.constructor && v.constructor.name;
  return c || typeof v;
}

/**
 * 单个值的「可读描述」：能 JSON 表示就预览，否则只报类型（不泄露内部结构）。
 * Map / Buffer / 循环引用这类混着地址与系统句柄的对象只报类型名。
 */
export function describeValue(v) {
  if (typeof v === 'function') return `[function ${v.name || 'anonymous'}]`;
  if (v instanceof Map) return `[Map · ${v.size} 项]（非 JSON 可表示，内部细节已清理）`;
  if (v instanceof Set) return `[Set · ${v.size} 项]（非 JSON 可表示，内部细节已清理）`;
  if (v instanceof WeakMap) return '[WeakMap]（非 JSON 可表示，内部细节已清理）';
  if (v instanceof WeakSet) return '[WeakSet]（非 JSON 可表示，内部细节已清理）';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) {
    return `[Buffer · ${v.length} 字节]（非 JSON 可表示，内部细节已清理）`;
  }
  if (ArrayBuffer.isView(v)) {
    return `[${v.constructor.name} · ${v.length} 项]（非 JSON 可表示，内部细节已清理）`;
  }
  // 普通对象：逐键展开——对象的价值通常在它的函数成员（api.getCustomers 等），
  // 直接 JSON.stringify 会把它们全抹成 {}，等于什么都没说。
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length && keys.some((k) => typeof v[k] === 'function')) {
      const body = keys
        .map((k) => `${k}: ${typeof v[k] === 'function' ? `[function ${v[k].name || 'anonymous'}]` : describeValue(v[k])}`)
        .join(', ');
      return `{ ${body} }`;
    }
  }
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return `[${typeName(v)}]（undefined）`;
    return s.length > 240 ? s.slice(0, 240) + '…(截断)' : s;
  } catch {
    return `[${typeName(v)}]（非 JSON 可表示，内部细节已清理）`;
  }
}

// ---- 调用栈 ----

/** 捕获调用栈：只留函数名与行列，丢掉绝对路径噪声 */
export function captureStack() {
  const raw = new Error('stack').stack || '';
  const frames = [];
  for (const line of raw.split('\n').slice(2)) {
    const m = line.match(/at\s+(?:async\s+)?([^\s(]+)?\s*\(([^)]+)\)/);
    if (m) frames.push(`${m[1] || '<anonymous>'} (${m[2]})`);
    else {
      const bare = line.match(/at\s+([^\s(]+)/);
      if (bare) frames.push(bare[1]);
    }
    if (frames.length >= 12) break;
  }
  return frames;
}
