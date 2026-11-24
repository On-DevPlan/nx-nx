// OpenAPI 文档生成：从 action 声明**运行时**派生（无第二份手写清单）。
//
// 这是「action 语义要强」的直接落点——method/path 来自 http 声明、参数描述来自
// schema 的 .describe()、summary 来自 @action 元数据。字段描述纪律
// （tests/unit/field-descriptions.test.mjs）守住了描述，这里就只做搬运。
//
// 口径与 typed client 一致：stream action（SSE）不进文档——它不是 req/resp
// 形状（请求挂起不返回 data 信封），硬塞进 OpenAPI 会误导消费方。
import type { ZodBoundAction } from '../../runtime/action-decorator.js';
import { routeParams } from '../../runtime/action-decorator.js';
import type { FieldDesc } from '../../runtime/zod-bridge.js';

/** zod-bridge 的 FieldKind → OpenAPI schema type。 */
function schemaOf(f: FieldDesc): Record<string, unknown> {
  switch (f.kind) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      return { type: 'array', items: { type: 'string' } };
    case 'kv':
    case 'json':
      return { type: 'object', additionalProperties: true };
    default:
      return f.enumValues?.length ? { type: 'string', enum: f.enumValues } : { type: 'string' };
  }
}

/** 参数对象（in: query / path）。 */
function paramOf(f: FieldDesc, where: 'query' | 'path'): Record<string, unknown> {
  return {
    name: f.name,
    in: where,
    required: where === 'path' ? true : f.required,
    description: f.desc ?? '',
    schema: schemaOf(f),
  };
}

export interface OpenApiDoc {
  openapi: string;
  info: { title: string; description: string; version: string };
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, unknown>>;
}

export interface OpenApiSource {
  appTitle: string;
  appDesc: string;
  version: string;
}

/** 从 registry 的 actions 生成 OpenAPI 3 文档（面板 / Swagger UI / 外部工具共用）。 */
export function buildOpenApiDoc(actions: readonly ZodBoundAction[], meta: OpenApiSource): OpenApiDoc {
  const paths: Record<string, Record<string, unknown>> = {};
  const tagNames = new Set<string>();

  for (const a of actions) {
    if (!a.http || a.stream) continue;
    const [method, pattern] = a.http;
    // ':param' → '{param}'（OpenAPI 的路径参数写法）
    const openPath = pattern.replace(/:([\w-]+)/g, (_m, k: string) => '{' + k + '}');
    const pathParams = routeParams(pattern);

    const fields = a.fields;
    const isGet = method === 'GET' || method === 'HEAD';
    const op: Record<string, unknown> = {
      operationId: a.id,
      summary: a.summary ?? a.id,
      tags: [a.module || 'platform'],
    };

    // 参数：路径参数 + （GET 的）query 参数。非 GET 的字段进 requestBody
    const parameters = fields
      .filter((f) => pathParams.includes(f.name))
      .map((f) => paramOf(f, 'path'));
    if (isGet) {
      for (const f of fields) {
        if (pathParams.includes(f.name) || f.positional) continue;
        parameters.push(paramOf(f, 'query'));
      }
    }
    if (parameters.length) op.parameters = parameters;

    if (!isGet) {
      const bodyFields = fields.filter((f) => !pathParams.includes(f.name));
      if (bodyFields.length) {
        op.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: Object.fromEntries(
                  bodyFields.map((f) => [f.name, { description: f.desc ?? '', ...schemaOf(f) }]),
                ),
                required: bodyFields.filter((f) => f.required).map((f) => f.name),
              },
            },
          },
        };
      }
    }

    op.responses = {
      '200': {
        description: '成功信封（ok: true, data: <返回值>）',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    };

    tagNames.add(a.module || 'platform');
    const node = (paths[openPath] = paths[openPath] || {});
    node[method.toLowerCase()] = op;
  }

  return {
    openapi: '3.1.0',
    info: { title: meta.appTitle, description: meta.appDesc, version: meta.version },
    tags: [...tagNames].sort().map((name) => ({ name, description: `${name} 域的 action` })),
    paths,
  };
}
