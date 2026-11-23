// setting.get —— 读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序）。
//
// 边界：后端**不校验页面是否存在**。「有哪些页」是前端路由树的事实，
// 后端既不知道也不需要知道——只校验形状（见 ../settings.ts 的规则）。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import { renderSettings, settingsSchemaList } from '../settings.js';

/** setting.get 的入参契约（无参数）。 */
const input = z.object({});

export class GetSettingsAction extends ActionBase<typeof input> {
  @action({
    id: 'setting.get',
    cli: ['setting', 'get'],
    http: ['GET', '/api/settings'],
    summary: '读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序）',
    input,
    render: (r) => renderSettings(r.settings),
  })
  override async run(_ctx: ActionInput<this['_input']>) {
    const store = this.deps.get('store');
    const s = await store.load();
    return { settings: s.settings, schema: settingsSchemaList() };
  }
}
