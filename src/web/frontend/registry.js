// 视图注册表。
import { lazy } from 'react';

export const VIEWS = [
  { id: 'create', title: '新建项目', component: lazy(() => import('../../modules/scaffold/view.jsx')) },
  { id: 'templates', title: '模板', component: lazy(() => import('../../modules/scaffold/templates-view.jsx')) },
];
