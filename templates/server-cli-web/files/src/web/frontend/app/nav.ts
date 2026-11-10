// 导航的唯一计算入口：路由树（页面有哪些）× 设置（用户怎么摆）。
//
// 任何壳都只调这里，不自己算。于是「摆法的解释」只有一份——
// 顶栏壳和左侧栏壳看到的顺序、分组、隐藏结果必然一致。
import { useMemo } from 'react';
import { useStore } from '../store.js';
import { NAV_PAGES } from './pages.js';
import { buildNav, configFromSettings } from '../components/navModel.js';
import type { NavPage, NavSection, NavItem } from '../components/navModel.js';

/** 能进导航的页面（= 声明了 nav 的那些），转成 navModel 需要的形状。 */
export const NAV_ROUTE_PAGES: NavPage[] = NAV_PAGES.map((p) => ({
  id: p.id,
  path: p.def.path,
  title: p.title,
  order: p.order,
}));

/** 全部可进导航的页面（含被隐藏的），栏目管理页要用它算候选。 */
export function useNavPages(): NavPage[] {
  return NAV_ROUTE_PAGES;
}

export interface NavView {
  flat: NavItem[];
  groups: NavSection[];
}

export function useNav(): NavView {
  const { settings } = useStore();
  const cfg = useMemo(() => configFromSettings(settings?.settings), [settings]);
  return useMemo(() => buildNav(cfg, NAV_ROUTE_PAGES), [cfg]);
}
