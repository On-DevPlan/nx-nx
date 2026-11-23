// 视图注册表。
//
// 新增面板 = 在这里登记一行 + 写一个 view。组件统一为 React 懒加载组件类型，
// 漏写 title/icon/component 立刻编译报错。
//
// 为什么每个视图要带 hint：侧栏只写四个字（「脚本」「服务」），
// 顶上那行小字才是「这个页面到底是干什么的」。新用户第一眼看的就是它。
//
// 图标用 lucide-react（开源 SVG 图标集，树摇友好）：不用 emoji、不自绘一次性
// 图标；同一套线条风格也让「收起成图标轨道」时仍然可读。
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { FolderPlus, LayoutTemplate, Server, Settings, SquareCode } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ViewDef {
  id: string;
  title: string;
  /** 顶栏的一句话说明（这个页面解决什么问题） */
  hint: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType>;
  /** 不从左侧导航出现：只能从父页面（如服务页的齿轮）进入的二级页 */
  hiddenInNav?: boolean;
}

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'create',
    title: '新建项目',
    hint: '从模板生成一个可直接运行的项目',
    icon: FolderPlus,
    component: lazy(() => import('./page/scaffold/view')),
  },
  {
    id: 'templates',
    title: '模板',
    hint: '本机可用的项目骨架与各自的选项',
    icon: LayoutTemplate,
    component: lazy(() => import('./page/scaffold/templates-view')),
  },
  {
    id: 'scripts',
    title: '脚本',
    hint: '长脚本走 Node、短脚本走沙箱；共享面板负责预置常量与函数',
    icon: SquareCode,
    component: lazy(() => import('./page/script/view')),
  },
  {
    id: 'services',
    title: '服务',
    hint: '长运行脚本的生命周期：探活、启动、停止，再看日志',
    icon: Server,
    component: lazy(() => import('./page/service-group/view')),
  },
  {
    id: 'service-settings',
    title: '服务设置',
    hint: '主脚本、活性检测、停止策略、共享面板与流水线',
    icon: Settings,
    component: lazy(() => import('./page/service-group/settings-view')),
    hiddenInNav: true,
  },
];
