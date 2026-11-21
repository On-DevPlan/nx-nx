// 首页：面板落地页（演示动作 + 运行信息 + 本机设置）。
//
// 一条路由 = 一个 routes/<名>.ts；页面本体在 pages/<名>/index.tsx。
// 别处不需要登记这条路由——app/pages.ts 会扫到它。
import { definePage } from './contract.js';

export default definePage({
  path: '/',
  nav: { label: '首页', order: 10 },
  // 不写 layout：使用 layout-default.ts 里的默认壳（左侧栏）。
  // 想回到顶栏 tab，只需在这里写 layout: 'app'。
  page: () => import('../pages/home/index.js'),
});
