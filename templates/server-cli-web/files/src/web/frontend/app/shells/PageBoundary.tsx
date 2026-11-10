// 页面级边界：加载态留在壳里，错误也留在壳里。
//
// 旧做法把 Suspense 与 ErrorBoundary 放在 App 顶层，于是「一页崩了」= 整个面板
// 白屏、头部导航一起没了，只能刷新。现在这两件事都挪到壳的 Outlet 外面一层：
//   加载中 → 导航还在，可以切走
//   出错   → 导航还在，可以切走；错误只占内容区
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';

export function PageBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="muted" style={{ padding: 24 }}>加载中…</div>}>{children}</Suspense>;
}

/** 挂在 route 的 errorElement 上。react-router 会把它渲染在壳的 Outlet 位置。 */
export function PageError() {
  const err = useRouteError() as { message?: string; status?: number; statusText?: string } | null;
  const text = err?.message || err?.statusText || (err?.status ? `HTTP ${err.status}` : '未知错误');
  return (
    <div className="empty">
      <p>这个页面出错了。</p>
      <p className="bad mono">{text}</p>
      <p className="muted">其它页面不受影响，可以从导航切走或刷新重试。</p>
    </div>
  );
}
