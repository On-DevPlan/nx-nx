// spike：schema 层 —— zod schema ↔ CLI 形态的桥。
//
// 这是整个验证里最关键的一块，也是与现有模型（FlagSpec + spec.ts 的 coerceOne）
// 差别最大的地方。结论先写在这里，细节见 README：
//
//   **zod 能替代「校验」，但替代不了「归一化」。**
//
// zod 的 schema 面向的是「已经成形的数据」：HTTP 侧天然如此（JSON body 里
// number 就是 number、boolean 就是 boolean）；CLI 侧天然相反（argv 里一切都是
// 字符串）。于是同一份 schema 要同时吃两种形态，中间必须有一层把 CLI 文本
// 归一化成 HTTP 形状的转换器——而这一层**只能从 schema 的内部结构反推**
// （zod 没有官方的「CLI 形态」概念），所以：
//
//   - 归一化规则是**代码**，不是 schema：随 schema 变化自动跟随，但规则本身写死；
//   - 归一化必须知道每个字段是 number / boolean / array / kv / json，
//     而 zod 不暴露这个信息，只能读 `_zod.def.type`（**内部 API，随版本可能变**）——
//     这是 zod 作为「CLI 契约源」的固有代价；
//   - `z.coerce` 不能直接用：`z.coerce.boolean()` 把字符串 'false' 变成 true，
//     `z.coerce.number()` 把空串变成 0。两个都与既有 CLI 语义冲突，必须自己写。
import type { ActionMeta } from './action.js';

export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'kv' | 'json';

export interface FieldDesc {
  name: string;
  kind: FieldKind;
  /** 位置参数（按 args 顺序消费 argv），其余是 --flag */
  positional: boolean;
  /** 没有 default 且非 optional → 必填 */
  required: boolean;
  default?: unknown;
  enumValues?: string[];
}

interface Unwrapped {
  inner: unknown;
  optional: boolean;
  defaultValue?: unknown;
}

/**
 * 拆掉 optional / default / nullable 外壳，拿到真正的类型 schema。
 * 读的是 zod v4 的 `_zod.def`（内部 API）——zod 没有公开的「取内层类型」方法。
 */
function unwrap(field: unknown): Unwrapped {
  let cur = field as { _zod?: { def?: Record<string, unknown> } };
  let optional = false;
  let defaultValue: unknown;
  for (;;) {
    const def = cur?._zod?.def;
    const tag = def?.type;
    if (tag === 'optional' || tag === 'nullable') {
      optional = true;
      cur = (def?.innerType as typeof cur) ?? cur;
      continue;
    }
    if (tag === 'default') {
      const dv = def?.defaultValue;
      defaultValue = typeof dv === 'function' ? (dv as () => unknown)() : dv;
      cur = (def?.innerType as typeof cur) ?? cur;
      continue;
    }
    break;
  }
  return { inner: cur, optional, defaultValue };
}

function kindOf(inner: unknown): FieldKind {
  const tag = (inner as { _zod?: { def?: { type?: string } } })?._zod?.def?.type;
  switch (tag) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'enum';
    case 'array':
      return 'array';
    case 'record':
      return 'kv';
    case 'unknown':
    case 'any':
      return 'json';
    default:
      return 'string';
  }
}

function enumValuesOf(inner: unknown): string[] {
  const def = (inner as { _zod?: { def?: { entries?: Record<string, string> } } })?._zod?.def;
  return Object.values(def?.entries ?? {});
}

/**
 * 把 action 的 input schema 拆成逐字段说明（CLI 与 HTTP 共用同一份）。
 *
 * **顺序很重要**：位置参数按 `meta.args` 的声明顺序消费 argv，不是按 schema 字段顺序。
 * 两者不一致时（例如 args: ['b','a'] 而 schema 是 {a,b}），按 schema 顺序会把值对调——
 * 所以这里先把位置参数按 args 顺序排到前面，其余字段保持 schema 顺序。
 */
export function describeInput(meta: ActionMeta): FieldDesc[] {
  const shape = (meta.input as unknown as { shape: Record<string, unknown> }).shape;
  const positionals = new Set(meta.args ?? []);
  const positionalIndex = new Map((meta.args ?? []).map((n, i) => [n, i]));
  const entries = Object.entries(shape).sort(([an], [bn]) => {
    const ai = positionalIndex.get(an);
    const bi = positionalIndex.get(bn);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  const out: FieldDesc[] = [];
  for (const [name, field] of entries) {
    const { inner, optional, defaultValue } = unwrap(field);
    const kind = kindOf(inner);
    out.push({
      name,
      kind,
      positional: positionals.has(name),
      required: !optional && defaultValue === undefined,
      default: defaultValue,
      enumValues: kind === 'enum' ? enumValuesOf(inner) : undefined,
    });
  }
  return out;
}

/** CLI 文本 → schema 期待的值。抛错信息沿用既有模型的「用法:」前缀约定。 */
export function normalizeCliValue(desc: FieldDesc, raw: unknown): unknown {
  // 裸 flag（`--port` 后面没跟值）会被解析器记成 true。
  // 放任下去：Number(true) === 1 会静默变成「深度 1」这种另一个合法值，
  // String(true) 则会把路径变成 'true'。宁可报错，也不要把笔误变成别的语义。
  if (raw === true && desc.kind !== 'boolean') {
    throw new Error(`参数 --${desc.name} 需要提供值`);
  }

  switch (desc.kind) {
    case 'number': {
      const s = String(raw).trim();
      if (s === '') throw new Error(`参数 --${desc.name} 需要提供值`);
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`参数 ${desc.name} 必须是数字，收到: ${raw}`);
      return n;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === true) return true; // 裸 `--flag` = 打开
      const s = String(raw).toLowerCase();
      // zod 的 coerce.boolean() 会把 'false' 变成 true —— 这里必须自己判。
      return !(s === 'false' || s === '0' || s === 'no' || s === '');
    }
    case 'array': {
      if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
      return String(raw)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    case 'kv': {
      // CLI：可重复的 `--set k=v`（解析器把同名 flag 收成数组）
      // HTTP：{k: v} 对象或 ['k=v'] 数组
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as object) };
      const list = Array.isArray(raw) ? raw : [raw];
      const out: Record<string, string> = {};
      for (const item of list) {
        const s = String(item);
        const eq = s.indexOf('=');
        if (eq <= 0) throw new Error(`参数 --${desc.name} 需要 key=value 形式，收到 ${JSON.stringify(item)}`);
        out[s.slice(0, eq).trim()] = s.slice(eq + 1);
      }
      return out;
    }
    case 'json': {
      if (typeof raw === 'object') return raw;
      const s = String(raw).trim();
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new Error(`参数 --${desc.name} 不是合法 JSON: ${(e as Error).message}`);
      }
    }
    default:
      // string / enum：原样透传（裸 flag 的情况已在函数开头的守卫里报错拦下）
      return String(raw);
  }
}

/** 用 zod 校验（并应用 default）。失败时抛带字段路径的错误。 */
export function parseInput(meta: ActionMeta, values: Record<string, unknown>): unknown {
  const result = meta.input.safeParse(values);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => `${i.path.join('.') || '(根)'} ${i.message}`)
    .join('；');
  throw new Error(`参数不合法: ${issues}`);
}

/** 用 zod 校验输出（服务端出参也守一道，client 侧可再校一次） */
export function parseOutput(meta: ActionMeta, value: unknown): unknown {
  const result = meta.output.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => `${i.path.join('.') || '(根)'} ${i.message}`)
    .join('；');
  throw new Error(`返回值不符合 output schema: ${issues}`);
}

