// spike：codegen —— 从同一份 action 声明生成两样东西：
//   1. `cli-tree.json`：CLI 树快照（命令结构的事实源，可被面板/文档消费）
//   2. `client.generated.ts`：给前端用的类型安全 apiclient
//
// **「半自动化」的边界就在这个文件里。** 能自动的部分：
//   - 每个 action 一个方法、名字与入参/返回类型（来自 zod 的 input/output schema）
//   - 路由模式、方法、路径参数抽取、query/body 的分流
//   - 入参出参各一次 zod 校验（前端也能拿到同一份 schema 做表单校验）
//
// 不能自动、必须手写的部分：
//   - **传输层**：base url、鉴权头、错误信封拆解、超时/重试（见 transport.ts）
//   - **交互层**：哪个按钮调哪个 action、加载态/失败态怎么显示、要不要刷新列表
//   - **schema 常量名**：codegen 靠「<camelCase(actionId)>Input/Output」的命名约定
//     拼 import 名，约定破了就生成不出可编译的代码（约定由测试钉住）
import type { ActionDef } from './registry.js';
import { routeParams } from './registry.js';
import { buildTree, type TreeNode } from './tree.js';
import { describeInput } from './schema.js';

/** actionId → schema 常量名：demo.greet → demoGreetInput（首段原样，其余段首字母大写） */
export function schemaName(actionId: string, suffix: 'Input' | 'Output'): string {
  const parts = actionId.split(/[.\-_]/).filter(Boolean);
  const camel = parts
    .map((seg, i) => (i === 0 ? seg : seg[0]!.toUpperCase() + seg.slice(1)))
    .join('');
  return camel + suffix;
}

/**
 * 前端方法名：取 actionId 的最后一段（demo.greet → greet），
 * 冲突时逐级加模块前缀（demoGreet）。冲突处理是必须的——
 * 不同模块的同名 action 在一个 client 里会撞车。
 */
export function clientMethodNames(actions: ActionDef[]): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const a of actions) {
    const parts = a.id.split('.');
    const base = parts[parts.length - 1]!;
    let candidate = base;
    if (used.has(candidate)) {
      // 撞名：加模块前缀（demo.greet 与 other.greet → demoGreet / otherGreet）
      const module = parts.length > 1 ? parts[parts.length - 2]! : 'action';
      const prefixed = module + base[0]!.toUpperCase() + base.slice(1);
      candidate = prefixed;
      let n = 2;
      while (used.has(candidate)) candidate = `${prefixed}${n++}`;
    }
    used.add(candidate);
    names.set(a.id, candidate);
  }
  return names;
}

/** CLI 树 → 可 JSON 序列化的快照 */
export function treeToJson(node: TreeNode): unknown {
  return {
    name: node.name,
    path: node.path,
    action: node.action
      ? {
          id: node.action.id,
          module: node.action.module,
          moduleTitle: node.action.moduleTitle,
          summary: node.action.summary ?? '',
          usage: node.action.cli.join(' '),
          http: node.action.http ? `${node.action.http[0]} ${node.action.http[1]}` : null,
        }
      : null,
    children: node.children.map(treeToJson),
  };
}

export function generateCliTreeJson(actions: ActionDef[]): string {
  return JSON.stringify(treeToJson(buildTree(actions)), null, 2) + '\n';
}

export interface GenCtx {
  /** schema 模块的相对导入路径（从生成文件算起） */
  schemaImport: string;
}

/** 生成前端 apiclient 的 TS 源码 */
export function generateClient(actions: ActionDef[], ctx: GenCtx): string {
  const withHttp = actions.filter((a) => a.http);
  const methodNames = clientMethodNames(withHttp);

  const imports = withHttp
    .flatMap((a) => {
      // 无字段的 action 不会用到 Input schema（生成物里没有 parse 调用）
      const names = describeInput(a).length ? [schemaName(a.id, 'Input')] : [];
      names.push(schemaName(a.id, 'Output'));
      return names;
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort()
    .map((n) => `  ${n},`)
    .join('\n');

  const iface = withHttp
    .map((a) => {
      const fields = describeInput(a);
      const paramType = `z.input<typeof ${schemaName(a.id, 'Input')}>`;
      const required = fields.some((f) => f.required);
      // 无字段的 action 不带参数（否则入参没人用）
      const sig = fields.length === 0 ? '' : required ? `input: ${paramType}` : `input?: ${paramType}`;
      const doc = a.summary ? `/** ${a.summary} */\n  ` : '';
      return `${doc}${methodNames.get(a.id)}(${sig}): Promise<z.output<typeof ${schemaName(a.id, 'Output')}>>;`;
    })
    .join('\n');

  const impl = withHttp
    .map((a) => {
      const inName = schemaName(a.id, 'Input');
      const outName = schemaName(a.id, 'Output');
      const methodName = methodNames.get(a.id)!;
      const [method, pattern] = a.http!;
      const params = routeParams(pattern);
      const fields = describeInput(a);
      const bodyFields = fields.filter((f) => !params.includes(f.name));
      const required = fields.some((f) => f.required);

      const isGet = method === 'GET' || method === 'HEAD';
      const lines: string[] = [];
      const argSig =
        fields.length === 0 ? '' : required ? `input: z.input<typeof ${inName}>` : `input?: z.input<typeof ${inName}>`;
      lines.push(`    async ${methodName}(${argSig}) {`);
      // 无字段的 action 不生成 parse（否则 parsed 没人用，lint 会报）
      if (fields.length) lines.push(`      const parsed = ${inName}.parse(input ?? {});`);

      const pathTemplate = pattern.replace(
        /:([\w-]+)/g,
        (_m, k: string) => '${encodeURIComponent(String(parsed[' + JSON.stringify(k) + ']))}',
      );
      lines.push(`      ${isGet ? 'let' : 'const'} path = \`${pathTemplate}\`;`);

      if (isGet) {
        lines.push('      const q = new URLSearchParams();');
        for (const f of bodyFields) {
          lines.push(
            `      if (parsed[${JSON.stringify(f.name)}] !== undefined) q.set(${JSON.stringify(f.name)}, String(parsed[${JSON.stringify(f.name)}]));`,
          );
        }
        lines.push('      const query = q.toString();');
        lines.push("      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;");
        lines.push(`      return ${outName}.parse(await transport.request(${JSON.stringify(method)}, path));`);
      } else {
        const body = bodyFields.map((f) => `${JSON.stringify(f.name)}: parsed[${JSON.stringify(f.name)}]`);
        lines.push(`      const body = { ${body.join(', ')} };`);
        lines.push(`      return ${outName}.parse(await transport.request(${JSON.stringify(method)}, path, body));`);
      }
      lines.push('    },');
      return lines.join('\n');
    })
    .join('\n');

  return `// AUTO-GENERATED —— 由 spike/zod-decorator/src/codegen.ts 生成，勿手改。
//
// 形状：接口给类型，实现给路由与校验；传输层（base url / 鉴权 / 错误信封）不在这里，
// 由手写的 Transport 提供 —— 这就是「半自动化」的那一半。

import type { z } from 'zod';
import {
${imports}
} from '${ctx.schemaImport}';

/** 手写的那一半：传输层契约 */
export interface Transport {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

export interface ApiClient {
${iface}
}

export function createApiClient(transport: Transport): ApiClient {
  return {
${impl}
  };
}
`;
}
