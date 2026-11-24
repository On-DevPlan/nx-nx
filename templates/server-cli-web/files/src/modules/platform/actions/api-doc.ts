// api.doc —— OpenAPI 文档（运行时从 action 声明派生，无手写清单）。
//
// 这条 action 存在的意义是「action 语义要强」的可验证性：method/path 来自
// http 声明、参数描述来自 schema 的 .describe()、summary 来自 @action 元数据。
// 加一条 action，文档自动多一节；字段描述漏写，字段描述门禁测试当场红。
//
// 文档本体在 modules/platform/openapi.ts（纯函数），这里只做「取上下文 + 交给它」。
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import { APP_NAME, APP_TITLE, APP_DESC } from '../../../core/paths.js';
import { buildOpenApiDoc } from '../openapi.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

/** 文档里的单个操作（render 只读这几个字段）。 */
interface DocOp {
  summary?: string;
  parameters?: Array<{ name: string; in: string; required: boolean; description: string }>;
}

/** api.doc 的入参契约（无参数）。 */
const input = z.object({});

export class ApiDocAction extends ActionBase<typeof input> {
  @action({
    id: 'api.doc',
    cli: ['api', 'doc'],
    http: ['GET', '/api/api-docs'],
    summary: 'OpenAPI 文档（从 action 声明自动生成）',
    input,
    render: (r) => {
      const lines = [`OpenAPI ${r.openapi} · ${r.info.title} v${r.info.version}`, ''];
      const paths = (r.paths ?? {}) as Record<string, Record<string, DocOp>>;
      for (const [path, ops] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(ops)) {
          lines.push(`${method.toUpperCase()} ${path}`);
          lines.push(`  ${op.summary}`);
          const params = op.parameters ?? [];
          if (params.length) {
            for (const p of params) {
              lines.push(`    ${p.in} ${p.name}${p.required ? '' : '?'} — ${p.description}`);
            }
          }
          lines.push('');
        }
      }
      return lines.join('\n');
    },
  })
  override async run(_ctx: ActionInput<this['_input']>) {
    // 动态 import registry：registry 静态依赖本模块，静态引入会成环
    const { registry } = await import('../../../runtime/registry.js');
    return buildOpenApiDoc(registry.actions, {
      appTitle: APP_TITLE || APP_NAME,
      appDesc: APP_DESC,
      version: VERSION,
    });
  }
}
