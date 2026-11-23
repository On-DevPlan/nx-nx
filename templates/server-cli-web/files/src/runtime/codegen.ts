// codegen：从同一份 action 契约生成两样东西——
//   1. client.generated.ts：给前端用的类型安全 apiclient
//   2. cli-tree.json：CLI 命令树快照（面板 / 文档可消费的事实源）
//
// **「半自动化」的边界（0.10.0 spike 结论，量化过的）：**
// 自动：每个 action 一个方法（入参类型经幻影字段 _input 从 action 类推导、
//       返回类型从 run 签名推断）、路由模式、
//       路径参数抽取、query/body 分流。
// 手写：传输层（本项目即 api/client.ts 的 api()——错误信封/超时已是现成的）、
//       页面接线（哪个按钮调哪个 action）。
//
// 与 spike 的一处刻意偏差：生成的 client **不在前端做 zod 运行时校验**
// （schema 只以 import type 出现，返回值 as 断言）——既有的 typed client 本来
// 就没有运行时校验，行为等价且省掉浏览器包里整个 zod。服务端依旧在
// zod-bridge 双端守 schema（CLI 与 HTTP 共用同一份）。
//
// 类型锚点（契约内联进 action 文件后的形态）：schema 常量是模块私有的，
// 前端够不着——入参走 `z.input<InstanceType<typeof X>['_input']>`（幻影字段把
// 类上的 TInput 露出来），出参走 run 的返回类型。两类都从 _manifest.generated.js
// type-only 引类；同一信息只声明一次，不存在「schema 与实现漂移」。
import { describeInput } from './zod-bridge.js';
import { routeParams, type ZodBoundAction } from './action-decorator.js';
import { cliPathsOf } from './spec.js';

/** 前端方法名：取 actionId 最后一段，撞名时加模块前缀（home.greet 与 x.greet → greet / xGreet）。 */
export function clientMethodNames(actions: ZodBoundAction[]): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const a of actions) {
    const parts = a.id.split('.');
    const base = parts[parts.length - 1]!;
    let candidate = base;
    if (used.has(candidate)) {
      const module = parts.length > 1 ? parts[parts.length - 2]! : 'action';
      candidate = module + base[0]!.toUpperCase() + base.slice(1);
      let n = 2;
      while (used.has(candidate)) candidate = `${module}${base[0]!.toUpperCase()}${base.slice(1)}${n++}`;
    }
    used.add(candidate);
    names.set(a.id, candidate);
  }
  return names;
}

/**
 * action 类按**模块**分组 import：生成物从 src/web/frontend/api/ 算起，
 * 类的再导出在 '../../../modules/<域>/actions/_manifest.generated.js'。
 */
/** 生成前端 apiclient 的 TS 源码（type-only 引类：zod 运行时不进浏览器包）。 */
export function generateClientSource(actions: ZodBoundAction[]): string {
  const withHttp = actions.filter((a) => a.http);
  const methodNames = clientMethodNames(withHttp);

  // 按模块分组收集 action 类（清单的再导出）——入参与出参的类型锚点全在类上：
  // 入参 `z.input<InstanceType<typeof X>['_input']>`（幻影字段露出 TInput），
  // 出参 run 的返回类型（**实现即契约**，同一信息只声明一次）。
  const actionClasses = new Map<string, Set<string>>();
  for (const a of withHttp) {
    const classes = actionClasses.get(a.module) || new Set<string>();
    classes.add(a.className);
    actionClasses.set(a.module, classes);
  }
  const imports = [...actionClasses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) => {
      const list = [...names].sort().map((n) => `  ${n},`).join('\n');
      return `import type {\n${list}\n} from '../../../modules/${module}/actions/_manifest.generated.js';`;
    })
    .join('\n');

  const iface = withHttp
    .map((a) => {
      const fields = describeInput(a.input, a.args ?? []);
      const paramType = `z.input<InstanceType<typeof ${a.className}>['_input']>`;
      const required = fields.some((f) => f.required);
      const sig = fields.length === 0 ? '' : required ? `input: ${paramType}` : `input?: ${paramType}`;
      const doc = a.summary ? `/** ${a.summary} */\n  ` : '';
      return `${doc}${methodNames.get(a.id)}(${sig}): Promise<Awaited<ReturnType<InstanceType<typeof ${a.className}>['${a.method}']>>>;`;
    })
    .join('\n');

  const impl = withHttp
    .map((a) => {
      const paramType = `z.input<InstanceType<typeof ${a.className}>['_input']>`;
      const methodName = methodNames.get(a.id)!;
      const [method, pattern] = a.http!;
      const params = routeParams(pattern);
      const fields = describeInput(a.input, a.args ?? []);
      const bodyFields = fields.filter((f) => !params.includes(f.name));
      const required = fields.some((f) => f.required);
      const isGet = method === 'GET' || method === 'HEAD';

      const lines: string[] = [];
      lines.push(`    // action: ${a.id}`);
      const argSig =
        fields.length === 0 ? '' : required ? `input: ${paramType}` : `input?: ${paramType}`;
      lines.push(`    async ${methodName}(${argSig}) {`);
      if (fields.length) {
        // 可选入参统一兜底成对象：后面的索引访问不用再判 undefined
        lines.push(`      const inp = input ?? ({} as ${paramType});`);
      }

      // 路径参数是位置参数（zodActionsOf 已校验 :param ⊆ args），编码后插进模板。
      const pathTemplate = fields.length
        ? pattern.replace(
            /:([\w-]+)/g,
            (_m, k: string) => '${encodeURIComponent(String(inp[' + JSON.stringify(k) + ']))}',
          )
        : pattern;
      lines.push(`      ${isGet && bodyFields.length ? 'let' : 'const'} path = \`${pathTemplate}\`;`);

      // 无 body 字段的非 GET 不能引用未定义的 body 变量（旧版生成物在这会红）
      const ret = `return (await transport.request(${JSON.stringify(method)}, path${isGet ? '' : bodyFields.length ? ', body' : ''})) as Awaited<ReturnType<InstanceType<typeof ${a.className}>['${a.method}']>>;`

      if (isGet) {
        if (bodyFields.length) {
          lines.push('      const q = new URLSearchParams();');
          for (const f of bodyFields) {
            lines.push(
              `      if (inp[${JSON.stringify(f.name)}] !== undefined) q.set(${JSON.stringify(f.name)}, String(inp[${JSON.stringify(f.name)}]));`,
            );
          }
          lines.push('      const query = q.toString();');
          lines.push("      if (query) path += (path.includes('?')) ? '&' + query : '?' + query;");
        }
        lines.push('      ' + ret);
      } else {
        if (bodyFields.length) {
          const body = bodyFields.map((f) => `${JSON.stringify(f.name)}: inp[${JSON.stringify(f.name)}]`);
          lines.push(`      const body = { ${body.join(', ')} };`);
        }
        lines.push('      ' + ret);
      }
      lines.push('    },');
      return lines.join('\n');
    })
    .join('\n');

  return `// AUTO-GENERATED —— 由 scripts/gen-api-client.mjs（src/runtime/codegen.ts）生成，勿手改。
//
// 类型来自 zod schema（import type，zod 运行时不进浏览器包）；运行时校验在服务端
// （runtime/zod-bridge.ts，CLI 与 HTTP 共用同一份 schema）。传输层是手写的那一半：
// 调 createApiClient 时传入 api/client.ts 的 api() 即可。
// 重新生成：pnpm gen:api。新鲜度由 tests/unit/api-client.test.mjs 对账。

import type { z } from 'zod';
${imports}

/** 传输层契约（手写的那一半）：返回 data（错误信封由 api() 拆好，失败即 throw）。 */
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

/** CLI 树节点（序列化用）。 */
export interface TreeNodeJson {
  name: string;
  path: string[];
  action: {
    id: string;
    module: string;
    summary: string;
    usage: string;
    http: string | null;
  } | null;
  children: TreeNodeJson[];
}

/** 从 action 声明派生层级命令树（无第二份手写清单——树是声明的产物）。 */
export function buildTreeJson(actions: ZodBoundAction[]): TreeNodeJson {
  type Node = { name: string; path: string[]; children: Node[]; action?: ZodBoundAction };
  const root: Node = { name: '', path: [], children: [] };
  for (const action of actions) {
    // 别名也是命令路径：每条路径都进树（树 = 命令表的层级视图）。
    for (const path of cliPathsOf(action)) {
      let node = root;
      path.forEach((seg, i) => {
        let next = node.children.find((c) => c.name === seg);
        if (!next) {
          next = { name: seg, path: path.slice(0, i + 1), children: [] };
          node.children.push(next);
        }
        node = next;
      });
      node.action = action;
    }
  }
  const toJson = (node: Node): TreeNodeJson => ({
    name: node.name,
    path: node.path,
    action: node.action
      ? {
          id: node.action.id,
          module: node.action.module,
          summary: node.action.summary ?? '',
          // usage 用节点自身路径渲染：多路径别名下 action.cli 不是扁平数组，
          // 直接 join 会把别名连成扁平串（参考实现的遗留 bug，这里修正）
          usage: node.path.join(' '),
          http: node.action.http ? `${node.action.http[0]} ${node.action.http[1]}` : null,
        }
      : null,
    children: node.children.map(toJson),
  });
  return toJson(root);
}

/** CLI 树快照 JSON（stable：字段序固定，适合入库对账）。 */
export function generateTreeJson(actions: ZodBoundAction[]): string {
  return JSON.stringify(buildTreeJson(actions), null, 2) + '\n';
}
