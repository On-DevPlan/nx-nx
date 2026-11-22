// 启动脚本「参数」文本框的解析与回写。
//
// 配置里存的是 argv 数组；面板上是一行文本。直接用空白 split 会把带空格的
// Windows 路径（如 C:\Program Files\app）拆坏，所以这里做一层最小引号语法：
//   --config "config/my env.json"   → ['--config', 'config/my env.json']
//   --name='a b'                    → ['--name=a b']
// 支持单 / 双引号；双引号内可用 \" 表示字面双引号，其余反斜杠原样保留（Windows 路径）。
// 不做变量展开、不做通配符——这里只负责把文本框还原成 argv。

export function splitArgsText(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote === '"' && ch === '\\' && text[i + 1] === '"') {
      cur += '"';
      i++;
      started = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = '';
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

/** argv → 文本框。含空白 / 引号的参数用引号包起来，保证再次解析不走样。 */
export function joinArgsText(args: string[]): string {
  return args.map(quoteArg).join(' ');
}

function quoteArg(arg: string): string {
  if (!arg) return '""';
  if (!/[\s"']/.test(arg)) return arg;
  if (!arg.includes('"')) return `"${arg}"`;
  if (!arg.includes("'")) return `'${arg}'`;
  return `"${arg.replaceAll('"', '\\"')}"`;
}
