// 看板：一个**不碰后端**的页面，用来证明「页面不必依赖 action 才能存在」。
//
// 版式由壳决定（默认左侧栏），页面本身不知道自己被摆在哪种壳里；将来新增壳时，
// 同一个 pages/<名>/index.tsx 可以直接挂到新壳下。
import { definePage } from './contract.js';

export default definePage({
  path: '/board',
  nav: { label: '看板', order: 20 },
  page: () => import('../pages/board/index.js'),
});
