// 短脚本沙箱（QuickJS / WASM）——「手边一段 JS，跑完就散」的受控执行环境。
//
// 与 _runner.mjs 的分工（两条路，各有各的适用面）：
//   _runner.mjs   真 Node 子进程：能用 fs / 网络 / 子进程，能用共享面板里的 async 函数。
//   _sandbox.mjs  本文件，QuickJS 虚拟机：没有 fs、没有网络、没有 process，
//                 只有宿主显式给的几个 API。跑不可信片段、跑纯计算、跑「试试这段逻辑」。
//
// 为什么是 wasm 沙箱而不是 node:vm：
//   node:vm 不是安全边界（逃逸手法一箩筐）；QuickJS 是独立解释器编译到 wasm，
//   宿主与脚本之间只有显式搭的几座桥，内存上限与执行时限都由宿主控制。
//
// 用法（env 驱动，结果以一行 JSON 打到 stdout）：
//   NX_SANDBOX_CODE     要执行的片段（优先）
//   NX_SANDBOX_FILE     片段所在文件（没给 CODE 时读它）
//   NX_SANDBOX_PANELS   共享面板路径，多个用 path.delimiter 分隔；先装载，再把导出转成
//                       JSON 数据注入（函数不进数据，改为 call() 桥接，仅同步函数）
//   NX_SANDBOX_ARGS     JSON 数组，注入为全局 args
//   NX_SANDBOX_TIMEOUT_MS / NX_SANDBOX_MEMORY_MB
//
// 沙箱内可用的东西（其余一律没有）：
//   log(...)            打到 logs（宿主收集，不打 stdout，避免污染结果行）
//   args                命令行/接口传进来的参数数组
//   set(key, value)     往「变量堆」里放一个值——堆就是这次执行的产出
//   heap()              读变量堆
//   panel               共享面板的数据快照（JSON 可表示的部分）
//   use(name)           取另一个面板的数据快照（多面板时）
//   call(name, ...args) 调共享面板里的**同步**函数，返回值已转成 JSON 数据
//
// 变量堆的输出形态：每项 { key, type, describe, json }。
//   describe 是「可读描述」（能 JSON 就预览，超长截断），json 是可安全传输的数据。
//   Map / Set / ArrayBuffer / 循环引用 / 函数：只报类型与说明，不泄露地址与内部句柄。
import { readFileSync } from 'node:fs';
import { delimiter, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARK = 'NX_SANDBOX_RESULT ';
const timeoutMs = Math.max(200, Number(process.env.NX_SANDBOX_TIMEOUT_MS) || 5000);
const memoryMb = Math.max(8, Number(process.env.NX_SANDBOX_MEMORY_MB) || 64);

// 沙箱内的 __describe：把任意值压成 { type, describe, json }。
// 这是**在虚拟机里执行**的源码，不能引用宿主作用域。
const DESCRIBE_SRC = `
globalThis.__describe = function (v) {
  var t;
  if (v === null) t = 'null';
  else if (Array.isArray(v)) t = 'array';
  else if (typeof v === 'function') t = 'function';
  else if (typeof v === 'object') t = (v.constructor && v.constructor.name) || 'object';
  else t = typeof v;
  if (t === 'function') return { type: t, describe: '[function ' + (v.name || 'anonymous') + ']', json: null };
  if (t === 'Map' || t === 'Set' || t === 'WeakMap' || t === 'WeakSet') {
    return { type: t, describe: '[' + t + (v.size !== undefined ? ' · ' + v.size + ' 项' : '') + ']（非 JSON 可表示，内部细节已清理）', json: null };
  }
  if (t === 'ArrayBuffer' || t === 'Uint8Array' || t === 'Int8Array' || t === 'DataView') {
    return { type: t, describe: '[' + t + ']（二进制，内部细节已清理）', json: null };
  }
  try {
    var s = JSON.stringify(v);
    if (s === undefined) return { type: t, describe: '[' + t + ']（undefined）', json: null };
    return {
      type: t,
      describe: s.length > 240 ? s.slice(0, 240) + '…(截断)' : s,
      json: s.length > 8000 ? null : JSON.parse(s)
    };
  } catch (e) {
    return { type: t, describe: '[' + t + ']（非 JSON 可表示，内部细节已清理）', json: null };
  }
};
`;

function emit(result) {
  process.stdout.write(MARK + JSON.stringify(result) + '\n');
}

function readCode() {
  const inline = process.env.NX_SANDBOX_CODE;
  if (inline && inline.trim()) return { code: inline, file: '' };
  const file = process.env.NX_SANDBOX_FILE;
  if (!file) throw new Error('缺少要执行的片段（NX_SANDBOX_CODE / NX_SANDBOX_FILE 都没有）');
  const abs = isAbsolute(file) ? file : resolve(process.cwd(), file);
  return { code: readFileSync(abs, 'utf8'), file: abs };
}

function parseArgs() {
  try {
    const v = JSON.parse(process.env.NX_SANDBOX_ARGS || '[]');
    return Array.isArray(v) ? v : [v];
  } catch {
    return [];
  }
}

// 面板导出 → 数据快照。函数不进数据（沙箱里没法跨边界持有宿主函数），
// 只留签名说明；需要调用就走 call() 桥。
function snapshotPanel(mod) {
  const data = {};
  const functions = [];
  for (const [k, v] of Object.entries(mod ?? {})) {
    if (k === 'default') continue;
    if (typeof v === 'function') {
      functions.push(k);
      continue;
    }
    data[k] = v;
  }
  return { data, functions };
}

async function loadPanels() {
  const raw = process.env.NX_SANDBOX_PANELS || '';
  const paths = raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
  const panels = {};
  const callables = {};
  const globals = {};
  if (!paths.length) return { panels, callables, globals };

  // 面板的产出有两种写法：具名导出，或挂到 globalThis（老面板都是后者）。
  // 两边都收——这是「共享面板只声明、不入口」约定的落地口径。
  // 内置别名单列：它们是宿主能力（fs / 网络 / 子进程），进沙箱就等于沙箱没了。
  const { ALIASES } = await import('./aliases.mjs');
  const aliasNames = new Set(ALIASES.map((a) => a.name));
  const before = new Set(Object.keys(globalThis));

  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    const name = abs
      .split(/[\\/]/)
      .pop()
      .replace(/\.mjs$/, '');
    const mod = await import(pathToFileURL(abs).href);
    const snap = snapshotPanel(mod);
    panels[name] = snap.data;
    for (const fnName of snap.functions) callables[fnName] = mod[fnName];
  }

  // globalThis 增量：函数 → 可调用，其它 → 面板数据
  for (const key of Object.keys(globalThis)) {
    if (before.has(key) || aliasNames.has(key) || key === '__tests' || key.startsWith('__')) continue;
    const v = globalThis[key];
    if (typeof v === 'function') callables[key] = v;
    else globals[key] = v;
  }
  return { panels, callables, globals };
}

function fmt(v) {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function jsonSafe(v) {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? null : JSON.parse(s);
  } catch {
    return null;
  }
}

// QuickJS 的异常句柄 → 可读信息
function describeError(vm, handle) {
  try {
    const dumped = vm.dump(handle);
    if (typeof dumped === 'string') return dumped;
    if (dumped && typeof dumped === 'object') {
      const name = dumped.name ? String(dumped.name) : 'Error';
      const msg = dumped.message ? String(dumped.message) : JSON.stringify(dumped);
      return `${name}: ${msg}`;
    }
    return String(dumped);
  } catch {
    return '沙箱执行失败（异常无法读取，可能是超时或内存超限）';
  }
}

async function main() {
  const started = Date.now();
  const { code, file } = readCode();
  const argv = parseArgs();
  const { panels, callables, globals } = await loadPanels();

  const { getQuickJS } = await import('quickjs-emscripten');
  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();
  vm.runtime.setMemoryLimit(memoryMb * 1024 * 1024);
  vm.runtime.setMaxStackSize(512 * 1024);

  const logs = [];
  const deadline = Date.now() + timeoutMs;
  vm.runtime.setInterruptHandler(() => Date.now() > deadline);

  try {
    // ---- 宿主 API（只搭这几座桥）----
    const logHandle = vm.newFunction('log', (...handles) => {
      logs.push(handles.map((h) => fmt(vm.dump(h))).join(' '));
    });
    vm.setProp(vm.global, 'log', logHandle);
    logHandle.dispose();

    // __call(name, argsJson)：只支持同步函数——wasm 里等不到宿主的 Promise。
    // 返回 JSON 字符串，真正的 call() 在沙箱预置里包一层（拆包 / 抛错都发生在沙箱内）。
    const callHandle = vm.newFunction('__call', (nameHandle, argsHandle) => {
      const name = vm.getString(nameHandle);
      const fn = callables[name];
      if (typeof fn !== 'function') {
        return vm.newString(JSON.stringify({ __error: `面板里没有函数 ${name}` }));
      }
      let args = [];
      try {
        const parsed = JSON.parse(vm.getString(argsHandle) || '[]');
        args = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        args = [];
      }
      try {
        const out = fn(...args);
        if (out && typeof out.then === 'function') {
          return vm.newString(
            JSON.stringify({
              __error: `${name} 是 async 函数：沙箱只支持同步调用，请改用 Node 运行（script run）`,
            }),
          );
        }
        return vm.newString(JSON.stringify({ __ok: true, value: jsonSafe(out) }));
      } catch (err) {
        return vm.newString(JSON.stringify({ __error: err instanceof Error ? err.message : String(err) }));
      }
    });
    vm.setProp(vm.global, '__call', callHandle);
    callHandle.dispose();

    // ---- 预置：args / panels / panel / use / set / heap / __describe ----
    const prelude = `
globalThis.args = ${JSON.stringify(argv)};
globalThis.panels = ${JSON.stringify(panels)};
globalThis.panel = (function () {
  var names = Object.keys(globalThis.panels);
  var base = names.length ? globalThis.panels[names[0]] : {};
  var out = {};
  var k;
  for (k in base) out[k] = base[k];
  for (k in ${JSON.stringify(globals)}) out[k] = ${JSON.stringify(globals)}[k];
  return out;
})();
globalThis.use = function (name) {
  var p = globalThis.panels[String(name)];
  if (!p) throw new Error('没有这个面板: ' + name + '（可用: ' + Object.keys(globalThis.panels).join(', ') + '）');
  return p;
};
globalThis.__heap = {};
globalThis.set = function (k, v) { globalThis.__heap[String(k)] = v; return v; };
globalThis.heap = function () { return globalThis.__heap; };
// call(name, ...args)：调面板里的同步函数；结果在沙箱内拆包，失败直接抛错。
globalThis.call = function () {
  var name = String(arguments[0]);
  var rest = Array.prototype.slice.call(arguments, 1);
  var raw = globalThis.__call(name, JSON.stringify(rest));
  var r = JSON.parse(raw);
  if (r.__error) throw new Error(r.__error);
  return r.value;
};
${DESCRIBE_SRC}
`;
    const pre = vm.evalCode(prelude, 'prelude.js');
    if (pre.error) {
      const msg = describeError(vm, pre.error);
      pre.error.dispose();
      vm.dispose();
      return emit({
        ok: false,
        error: `沙箱初始化失败: ${msg}`,
        logs,
        heap: [],
        panels: Object.keys(panels),
        durationMs: Date.now() - started,
        timeoutMs,
        memoryMb,
        file: file || '',
      });
    }
    pre.value.dispose();

    // ---- 执行片段（包在函数里：顶层 const/let 不污染全局，也不撞名）----
    let error = null;
    let ok = true;
    const runHandle = vm.evalCode(`(function(){\n"use strict";\n${code}\n})()`, file || 'sandbox.js');
    if (runHandle.error) {
      ok = false;
      error = describeError(vm, runHandle.error);
      runHandle.error.dispose();
    } else {
      runHandle.value.dispose();
    }

    // ---- 变量堆快照（在沙箱内先转成纯数据，跨边界只传 JSON 字符串）----
    let heapRows = [];
    if (ok) {
      const snap = vm.evalCode(
        `JSON.stringify(Object.keys(__heap).map(function (k) { return [k, __describe(__heap[k])]; }))`,
      );
      if (snap.error) {
        snap.error.dispose();
      } else {
        try {
          heapRows = JSON.parse(vm.getString(snap.value)).map(([key, d]) => ({ key, ...d }));
        } catch {
          heapRows = [];
        }
        snap.value.dispose();
      }
    }

    emit({
      ok,
      error,
      logs,
      heap: heapRows,
      panels: Object.keys(panels),
      durationMs: Date.now() - started,
      timeoutMs,
      memoryMb,
      file: file || '',
    });
  } finally {
    vm.dispose();
  }
}

try {
  await main();
} catch (err) {
  emit({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    logs: [],
    heap: [],
    panels: [],
    durationMs: 0,
    timeoutMs,
    memoryMb,
    file: '',
  });
  process.exitCode = 1;
}
