// 视图注册表。
//
// 新增面板 = 在这里登记一行 + 写一个 view。组件统一为 React 懒加载组件类型，
// 漏写 title/component 立刻编译报错。
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

export interface ViewDef {
  id: string;
  title: string;
  component: LazyExoticComponent<ComponentType>;
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'home', title: '首页', component: lazy(() => import('../../modules/home/view')) },
];
