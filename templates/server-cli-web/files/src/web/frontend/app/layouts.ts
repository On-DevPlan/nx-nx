// 壳清单：route.ts 里的 `layout` 字段写的就是这里的键。
//
// 这是全项目**唯一**需要在「加一种新版式」时改的全局文件——一行。
// 对比旧骨架：换版式要重写 App.tsx，加页面要改 6 个文件。差别在这里。
import type { ComponentType } from 'react';
import AppShell from './shells/AppShell.js';
import SidebarShell from './shells/SidebarShell.js';

export const LAYOUTS: Record<string, ComponentType> = {
  app: AppShell,
  sidebar: SidebarShell,
};

export const DEFAULT_LAYOUT = 'app';

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
