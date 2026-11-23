// system.health —— 自检：模板目录是否可读、有几个模板
//
// 一条 action 一个文件：声明（id/cli/http/summary）、契约（zod schema）与实现同文件。
// 模块 index.ts 不手工列举 action——清单由 `pnpm gen:actions` 生成。
import { defineAction } from '../../../runtime/types/action.js';
import { templatesDir } from '../../../core/templates.js';
import * as template from '../../template/service.js';

export default defineAction({
  id: 'system.health',
  cli: ['health'],
  http: ['GET', '/api/health'],
  summary: '自检：模板目录是否可读、有几个模板',
})(
  async () => {
          let dir: string | null = null;
          let ok = true;
          let reason = '';
          try {
            dir = templatesDir();
          } catch (err) {
            ok = false;
            reason = String((err as { message?: string })?.message || err);
          }
          const { templates, errors } = ok
            ? await template.list()
            : { templates: [], errors: [] as { id: string; message: string }[] };
          return {
            status: ok ? 'ok' : 'blocked',
            templatesDir: dir,
            templates: templates.length,
            broken: errors,
            reason,
          };
        },
  (r) =>
          r.status === 'ok'
            ? `正常 · 模板目录 ${r.templatesDir} · ${r.templates} 个模板` +
              (r.broken.length ? `\n${r.broken.length} 个模板不合法` : '')
            : `异常 · ${r.reason}`
);
