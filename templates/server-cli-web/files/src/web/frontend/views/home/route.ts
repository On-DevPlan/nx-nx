// 首页：面板落地页（演示动作 + 运行信息 + 本机设置）。
//
// 一个页面 = 一个目录。route.ts 声明身份与摆法，page.tsx 是组件，api.ts 收口后端调用。
// 别处不需要登记这个页面——router 会扫到它。
import { definePage } from '../../app/route.js';

export default definePage({
  path: '/',
  nav: { label: '首页', order: 10 },
  layout: 'app',
  page: () => import('./page.js'),
});
