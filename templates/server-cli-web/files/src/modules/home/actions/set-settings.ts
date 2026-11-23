// setting.set —— 修改设置（PATCH 语义：只改传入的项）。
//
// 校验规则在 ../settings.ts（与 get 共用）；这里只做「取 patch → 归一 → 落盘」。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import { badInput, notFound } from '../../../core/errors/index.js';
import { SETTINGS_SCHEMA, renderSettingSet } from '../settings.js';
import type { Settings } from '../../../core/store.js';

/** setting.set 的入参契约。 */
const input = z.object({
  key: z.string().optional().describe('要改的设置项名'),
  // --value 是 CLI 字符串 token；结构化值走 --set（record unknown，值多态由
  // service.ts 的 SCHEMA.coerce 当家）。声明成 string 而不是 unknown：
  // unknown 会被 zod-bridge 判成 json 字段，--value dark 会被误 JSON.parse。
  value: z.string().optional().describe('设置项的新值（与 --key 成对）'),
  set: z.record(z.string(), z.unknown()).optional().describe('结构化赋值 k=v（可重复）'),
  'dry-run': z.boolean().optional().describe('只演算不落盘，回显将要写入的值'),
});

export class SetSettingsAction extends ActionBase<typeof input> {
  @action({
    id: 'setting.set',
    cli: ['setting', 'set'],
    http: ['PATCH', '/api/settings'],
    summary: '修改设置（PATCH 语义：只改传入的项）',
    input,
    render: (r) => renderSettingSet(r),
  })
  override async run(ctx: ActionInput<this['_input']>) {
    const patch: Record<string, unknown> = { ...(ctx.set || {}) };
    if (ctx.key !== undefined) patch[ctx.key] = ctx.value;

    const keys = Object.keys(patch);
    if (!keys.length) throw badInput('至少要给一项：setting set --key <名> --value <值>，或 --set k=v（可重复）');

    const resolved: Record<string, unknown> = {};
    for (const k of keys) {
      const spec = SETTINGS_SCHEMA[k];
      if (!spec) throw notFound(`未知设置项: ${k}（可用: ${Object.keys(SETTINGS_SCHEMA).join(', ')}）`);
      resolved[k] = spec.coerce(patch[k]);
    }

    if (ctx['dry-run'] === true) return { status: 'skipped' as const, dryRun: true as const, wouldSet: resolved };

    const store = this.deps.get('store');
    const after = (await store.mutate((s) => {
      const settings = s.settings as Settings;
      for (const [k, v] of Object.entries(resolved)) (settings as Record<string, unknown>)[k] = v;
      return { ...settings };
    })) as Settings;

    return { status: 'ok' as const, settings: after };
  }
}
