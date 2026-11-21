// 壳清单：route.ts 里的 `layout` 字段写的就是这里的键。
//
// 默认壳常量在 layout-default.ts——那个文件只放常量、不 import 组件，
// 让 pages.ts 能安全地读它而不制造循环依赖。
import type { ComponentType } from 'react';
import { DEFAULT_LAYOUT } from './layout-default.js';
import AppShell from './shells/app-shell/index.js';
import SidebarShell from './shells/sidebar-shell/index.js';

export { DEFAULT_LAYOUT };

export const LAYOUTS: Record<string, ComponentType> = {
  app: AppShell,
  sidebar: SidebarShell,
};

/** 取壳；未登记的名字退回默认壳并大声说出来（不静默降级）。 */
export function layoutOf(name: string | undefined): ComponentType {
  const key = name || DEFAULT_LAYOUT;
  const found = LAYOUTS[key];
  if (!found) {
    console.error(
      'route.ts 的 layout 未登记: ' + key + '（可用: ' + Object.keys(LAYOUTS).join(', ') + '），已退回 ' + DEFAULT_LAYOUT,
    );
    return LAYOUTS[DEFAULT_LAYOUT]!;
  }
  return found;
}
