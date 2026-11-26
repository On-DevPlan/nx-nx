// 壳清单：route.ts 里的 `layout` 字段写的就是这里的键。
//
// 出厂只登记默认壳（左侧栏）。新增版式的步骤是「加文件 + 加一行」：
//   1. app/shells/<x>-shell/index.tsx（里面放 <Outlet />，用 useNav() 折导航）
//   2. 本文件 LAYOUTS 加一行 `<x>: <X>Shell`
//   3. 目标 route 写 `layout: '<x>'`
//
// 默认壳常量在 layout-default.ts——那个文件只放常量、不 import 组件，
// 让 pages.ts 能安全地读它而不制造循环依赖。
import type { ComponentType } from 'react';
import { DEFAULT_LAYOUT } from './layout-default.js';
import SidebarShell from './shells/sidebar-shell/index.js';

export { DEFAULT_LAYOUT };

export const LAYOUTS: Record<string, ComponentType> = {
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
