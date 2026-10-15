// 设置模块：本机配置的唯一归属（含**头部导航的分组 / 隐藏 / 平铺顺序**）。
//
// 为什么设置要独立成模块：任何模块想加一个设置项，都写到这里，而不是寄生在别人家里——
// 否则「加个开关」就得去改另一个模块的代码。面板的「设置」页也由本模块承载。
//
// 导航配置是**显示配置**：决定头部有哪些入口、怎么分组、哪个不显示、平铺怎么排；
// 不改任何业务数据，页面被隐藏只是入口不出现（深链仍然可用）。
import * as service from './service.js';

export default {
  id: 'settings',
  title: '设置',
  order: 90,
  view: () => import('./view.jsx'),
  actions: [
    {
      id: 'setting.get',
      cli: ['setting', 'get'],
      http: ['GET', '/api/settings'],
      summary: '读取全部设置（含头部导航分组 / 隐藏 / 平铺顺序）与页面清单',
      flags: {},
      run: () => service.getSettings(),
      render: (d) => service.renderSettings(d),
    },
    {
      id: 'setting.set',
      cli: ['setting', 'set'],
      http: ['PATCH', '/api/settings'],
      summary: '修改设置（PATCH 语义：只改传入的项）',
      flags: {
        key: { type: 'string', hint: '设置项名' },
        value: { type: 'string', hint: '取值' },
        set: { type: 'kv', hint: 'k=v，可重复（值可以是 JSON 数组，如 navGroups=[{...}]）' },
        'dry-run': { type: 'boolean' },
      },
      run: (ctx) => service.setSettings(ctx),
      render: (d) => service.renderSettingSet(d),
    },
  ],
};
