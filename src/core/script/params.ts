// 脚本参数声明：从源码头部注释解析出结构化的参数表。
//
// 为什么用注释而不是运行时导出：
//   参数表要在**脚本执行之前**拿到（渲染表单用），运行时导出必须先把脚本跑一遍——
//   那是副作用（起服务、发请求、改文件），不能为了画个输入框付出这个代价。
//
// 语法（每行一个，写在脚本头部）：
//   // @param port number 18999 监听端口
//   // @param host string 127.0.0.1 绑定地址
//   // @param mode select(dev|prod) dev 运行模式
//   // @param verbose boolean false 输出详细信息
//
// 类型：string / number / boolean / select(a|b|c)
// 默认值：字面量；不需要默认值写 `-`（表单留空即可）
// 说明：该行剩余部分

export type ParamType = 'string' | 'number' | 'boolean' | 'select';

export interface ScriptParam {
  name: string;
  type: ParamType;
  options?: string[];
  /** 默认值（字符串形态；boolean 用 'true'/'false'；无默认值为 ''） */
  default: string;
  desc: string;
}

const PARAM_RE = /^\s*(?:\/\/+|\*)\s*@param\s+(\S+)\s+(string|number|boolean|select\(\s*[^)]*\))\s+(\S*)\s*(.*)$/;

export function parseParams(content: string): ScriptParam[] {
  const out: ScriptParam[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    // 只扫前 80 行：参数声明属于头部契约，正文里的 @param 不算
    if (out.length > 0 && out.length >= 40) break;
    const m = PARAM_RE.exec(line);
    if (!m) continue;
    const [, name, rawType, rawDefault, desc] = m;
    if (!name || !rawType || seen.has(name)) continue;
    seen.add(name);

    let type: ParamType = 'string';
    let options: string[] | undefined;
    if (rawType.startsWith('select')) {
      type = 'select';
      const inner = rawType.slice(rawType.indexOf('(') + 1, rawType.lastIndexOf(')'));
      options = inner
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      type = rawType as ParamType;
    }

    out.push({
      name,
      type,
      options,
      default: rawDefault === '-' ? '' : (rawDefault ?? ''),
      desc: (desc ?? '').trim(),
    });
  }
  return out;
}

// 参数值 → CLI flag token（与 service.flagTokens 的同款语义：
//   boolean true  → '--k'
//   boolean false / string '' → 跳过
//   其余          → '--k=v'（等号连写，值里的空格不会散成两个 token）
export function paramTokens(params: ScriptParam[], values: Record<string, string>): string[] {
  const out: string[] = [];
  for (const p of params) {
    const v = values[p.name];
    if (v === undefined) continue;
    if (p.type === 'boolean') {
      if (v === 'true') out.push(`--${p.name}`);
      continue;
    }
    if (v === '') continue;
    out.push(`--${p.name}=${v}`);
  }
  return out;
}

// 初始值：把声明里的默认值铺成表单初值
export function defaultValues(params: ScriptParam[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) out[p.name] = p.default;
  return out;
}
