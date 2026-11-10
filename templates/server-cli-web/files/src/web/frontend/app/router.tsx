// 路由树：由 views/*/route.ts 自动汇聚，按 layout 分组挂到各自的壳下。
//
// 用 HashRouter 而不是 BrowserRouter：server 只把 dist/web/public 当静态目录发，
// 没有 SPA fallback（未命中的路径一律 404）。hash 路由的路径不经过服务端，
// 因此刷新、深链、后退全都不需要改后端一行。
import { lazy } from 'react';
import { createHashRouter, type RouteObject } from 'react-router-dom';
import { PAGES } from './pages.js';
import { layoutOf } from './layouts.js';
import { PageError } from './shells/PageBoundary.js';
import NotFound from './NotFound.js';

/** 一个页面 → 一条路由。页面组件懒加载，错误边界挂在**页面这一层**（壳还在）。 */
function toRoute(entry: (typeof PAGES)[number]): RouteObject {
  const Page = lazy(entry.def.page);
  return {
    path: entry.def.path,
    element: <Page />,
    errorElement: <PageError />,
  };
}

/** 按壳分组：同一个壳下的页面共享一个父路由（壳只渲染一次，切页不重挂壳）。 */
function shellRoutes(): RouteObject[] {
  const byLayout = new Map<string, RouteObject[]>();
  for (const entry of PAGES) {
    const list = byLayout.get(entry.layout) || [];
    list.push(toRoute(entry));
    byLayout.set(entry.layout, list);
  }
  return [...byLayout].map(([layout, children]) => {
    const Shell = layoutOf(layout);
    return { element: <Shell />, errorElement: <PageError />, children };
  });
}

// 显式标注返回类型：react-router 的 router 类型来自内部包，直接推导会让
// `tsc -b`（composite/declaration 模式）报 TS2742「无法在不引用内部路径的情况下命名该类型」。
export const router: ReturnType<typeof createHashRouter> = createHashRouter([
  ...shellRoutes(),
  { path: '*', element: <NotFound /> },
]);
