// 看板：挂在**左侧栏壳**下的页面，用来证明「换一种版式」不用碰任何既有代码。
//
// 它和首页除了都调 useNav 之外没有任何关系：版式由 layout 决定，页面本身
// 完全不知道自己被摆在顶栏还是侧栏里。同一个 page.tsx 可以同时挂到两种壳下。
import { definePage } from '../../app/route.js';

export default definePage({
  path: '/board',
  nav: { label: '看板', order: 20 },
  layout: 'sidebar',
  page: () => import('./page.js'),
});
