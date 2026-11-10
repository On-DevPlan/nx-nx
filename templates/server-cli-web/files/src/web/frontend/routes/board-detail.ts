// 看板详情：**不写 nav 就不进导航**的页面，同时演示路由参数。
//
// 这正是旧骨架做不到的事：路由是「id 到组件」的平面映射，加不出 /board/:id 这种
// 带参数的路径，只能另起一个 id 再手写一套取参逻辑。
import { definePage } from './contract.js';

export default definePage({
  path: '/board/:id',
  layout: 'sidebar',
  page: () => import('../pages/board-detail/index.js'),
});
