// 输出原语（供 aliases.mjs 挂成全局函数）。
//
// 只依赖 node: 内置：这一层不认识 nx-nx，也不认识任何业务概念。
// 所有输出走 stderr 之外的 stdout——脚本的 stdout 就是它的「结果」。
const TAG = {
  log: '',
  ok: '✔',
  warn: '⚠',
  fail: '✖',
};

export function log(...args) {
  console.log(...args);
}

export function ok(...args) {
  console.log(TAG.ok, ...args);
}

export function warn(...args) {
  console.error(TAG.warn, ...args);
}

export function fail(...args) {
  console.error(TAG.fail, ...args);
}

export function heading(text) {
  console.log('');
  console.log(`── ${text} ──`);
}

// 表格：rows 可以是对象数组（表头取自首个对象的键）或二维数组。
export function table(rows, headers) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    console.log('（空）');
    return;
  }
  let head = headers;
  let body = list;
  if (list[0] && typeof list[0] === 'object' && !Array.isArray(list[0])) {
    head = head || Object.keys(list[0]);
    body = list.map((r) => head.map((h) => stringify(r[h])));
  }
  const cols = head || body[0].map((_, i) => `#${i + 1}`);
  const widths = cols.map((c, i) =>
    Math.max(displayWidth(String(c)), ...body.map((r) => displayWidth(stringify(r[i])))),
  );
  const line = (cells) => cells.map((c, i) => pad(stringify(c), widths[i])).join('  ').trimEnd();
  console.log(line(cols));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of body) console.log(line(r));
}

function stringify(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// 中日韩字符按 2 列宽算，否则表格会歪。
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    w += code > 0x2e80 && code < 0xffe0 ? 2 : 1;
  }
  return w;
}

function pad(s, width) {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}
