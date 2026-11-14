// 视图注册表。
//
// 新增面板 = 在这里登记一行 + 写一个 view。组件统一为 React 懒加载组件类型，
// 漏写 title/icon/component 立刻编译报错。
//
// 为什么每个视图要带 hint：侧栏只写四个字（「脚本」「服务」），
// 顶上那行小字才是「这个页面到底是干什么的」。新用户第一眼看的就是它。
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  CodeOutlined,
} from '@ant-design/icons';

export interface ViewDef {
  id: string;
  title: string;
  /** 顶栏的一句话说明（这个页面解决什么问题） */
  hint: string;
  icon: ComponentType<{ className?: string }>;
  component: LazyExoticComponent<ComponentType>;
}

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'create',
    title: '新建项目',
    hint: '从模板生成一个可直接运行的项目',
    icon: AppstoreAddOutlined,
    component: lazy(() => import('../../modules/scaffold/view')),
  },
  {
    id: 'templates',
    title: '模板',
    hint: '本机可用的项目骨架与各自的选项',
    icon: AppstoreOutlined,
    component: lazy(() => import('../../modules/scaffold/templates-view')),
  },
  {
    id: 'scripts',
    title: '脚本',
    hint: '长脚本走 Node、短脚本走沙箱；共享面板负责预置常量与函数',
    icon: CodeOutlined,
    component: lazy(() => import('../../modules/script/view')),
  },
  {
    id: 'services',
    title: '服务',
    hint: '服务组的启动、关闭与自愈——三个动作，不铺更多按钮',
    icon: CloudServerOutlined,
    component: lazy(() => import('../../modules/service-group/view')),
  },
];
