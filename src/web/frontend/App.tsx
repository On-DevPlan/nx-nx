// 面板壳：左侧导航 + 顶栏 + 视图区。**这个文件几乎不需要改**——
// 新增面板 = 在 registry.ts 登记一行 + 写一个 view。
//
// 左侧栏的两件事在这里一次做掉：
//   1. **拖拽改宽**：宽度落在 store（localStorage 持久化），下次打开还是你的宽度；
//      键盘也能调（← → 16px，Home 回默认），不只有鼠标可用。
//   2. **一键全展开 / 收起**：收起后只剩 56px 的图标轨道，导航项靠 tooltip 认；
//      展开态恢复记住的宽度——两个状态都是同一份 ui.sideWidth，不会互相覆盖。
//
// 图标用 lucide-react（开源 SVG）：收起成轨道时，只剩图标也必须一眼认得出页面。
import { Suspense, useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { VIEWS } from './registry.js';
import { useStore } from './store.js';
import { ErrorBoundary } from './components/ui.jsx';

function viewFromHash(): string {
  return location.hash.replace(/^#\/?/, '');
}

const COLLAPSED_W = 56;

export default function App() {
  const { ui, patchUi, boot, refreshBoot, sideLimits } = useStore();
  const navViews = VIEWS.filter((v) => !v.hiddenInNav);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  // 窗口聚焦时刷新 bootstrap：别的终端改了状态，这里能看到。
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshBoot().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshBoot]);

  // 启动时把 hash 同步进 store；后续切换时也回写 hash（可分享、可后退）
  useEffect(() => {
    const fromHash = viewFromHash();
    if (fromHash && fromHash !== ui.view) patchUi({ view: fromHash });
    else if (!location.hash && ui.view) location.hash = '#/' + ui.view;
    // 只在挂载时跑一次：后续由下面的 effect 单向回写
  }, []);

  useEffect(() => {
    if (ui.view) location.hash = '#/' + ui.view;
  }, [ui.view]);

  useEffect(() => {
    const onHash = () => patchUi({ view: viewFromHash() });
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [patchUi]);

  // 启动时把 hash 同步进 store；后续切换时也回写 hash（可分享、可后退）
  const current = VIEWS.find((v) => v.id === ui.view) || navViews[0];
  const appName = boot?.app?.name || 'nx-nx';
  const online = Boolean(boot);

  const width = ui.sideOpen ? ui.sideWidth : COLLAPSED_W;
  const clampWidth = (w: number) => Math.min(sideLimits.max, Math.max(sideLimits.min, Math.round(w)));

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startW: ui.sideWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    patchUi({ sideWidth: clampWidth(drag.current.startW + e.clientX - drag.current.startX), sideOpen: true });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // 键盘可达：方向键微调，Home 回默认宽度，Enter/Space 切换展开
  const onResizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') patchUi({ sideWidth: clampWidth(ui.sideWidth - 16), sideOpen: true });
    else if (e.key === 'ArrowRight') patchUi({ sideWidth: clampWidth(ui.sideWidth + 16), sideOpen: true });
    else if (e.key === 'Home') patchUi({ sideWidth: sideLimits.def, sideOpen: true });
    else if (e.key === 'Enter' || e.key === ' ') patchUi({ sideOpen: !ui.sideOpen });
    else return;
    e.preventDefault();
  };

  return (
    <div className="shell" style={{ '--side-w': `${width}px` } as CSSProperties}>
      <aside className={'side' + (ui.sideOpen ? '' : ' side-collapsed')} aria-label="主导航">
        <div className="side-brand">
          {/* 同 index.html 的内联 SVG 思路：避免对 /logo-rounded.png 的 404 */}
          <svg className="brand-mark" viewBox="0 0 32 32" role="img" aria-label="nx-nx">
            <rect width="32" height="32" rx="7" fill="#171717" />
            <text
              x="16"
              y="22.5"
              fontFamily="sans-serif"
              fontSize="17"
              fontWeight={700}
              fill="#ffffff"
              textAnchor="middle"
            >
              nx
            </text>
          </svg>
          <span className="brand-name">{appName}</span>
          <button
            type="button"
            className="icon-btn side-toggle"
            aria-label={ui.sideOpen ? '收起为图标栏' : '完全展开侧栏'}
            title={ui.sideOpen ? '收起为图标栏' : '完全展开侧栏'}
            aria-pressed={!ui.sideOpen}
            onClick={() => patchUi({ sideOpen: !ui.sideOpen })}
          >
            {ui.sideOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        <nav className="side-nav">
          <div className="side-group">工作台</div>
          {navViews.map((v) => {
            const Icon = v.icon;
            const active = current && current.id === v.id;
            return (
              <button
                key={v.id}
                className={'nav-item' + (active ? ' active' : '')}
                onClick={() => patchUi({ view: v.id })}
                aria-current={active ? 'page' : undefined}
                title={ui.sideOpen ? undefined : v.title}
                aria-label={v.title}
              >
                <Icon className="nav-icon" size={16} strokeWidth={1.9} />
                <span className="nav-label">{v.title}</span>
              </button>
            );
          })}
          {navViews.length === 0 && <span className="muted nav-empty">暂无视图</span>}
        </nav>

        <div className="side-foot">
          <span className={'dot ' + (online ? 'dot-ok' : 'dot-bad')} />
          <span className="mono side-foot-text">{online ? 'serve 在线' : 'serve 离线'}</span>
          <span className="ver-tag side-foot-ver">{boot ? `v${boot.app.version}` : ''}</span>
        </div>

        <div
          className="side-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整侧栏宽度（双击恢复默认）"
          aria-valuemin={sideLimits.min}
          aria-valuemax={sideLimits.max}
          aria-valuenow={Math.round(ui.sideOpen ? ui.sideWidth : 56)}
          title="拖拽改宽 · 双击恢复默认"
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => patchUi({ sideWidth: sideLimits.def, sideOpen: true })}
          onKeyDown={onResizeKey}
        >
          <span className="side-resizer-grip" aria-hidden />
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-text">
            <div className="topbar-title">{current ? current.title : '未注册视图'}</div>
            <div className="topbar-hint">{current ? current.hint : '在 registry.ts 登记一个视图'}</div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-btn"
              title="重新读取服务端状态（bootstrap）"
              aria-label="刷新状态"
              onClick={() => refreshBoot().catch(() => {})}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        <main className="content">
          {!current ? (
            <div className="empty">
              <p>
                还没有注册任何视图。在 <code>src/modules/&lt;域&gt;/view.tsx</code> 写一个，
                再在 <code>src/web/frontend/registry.ts</code> 登记一行。
              </p>
              <p>
                CLI 已就绪：<code>{appName} help</code> / <code>{appName} routes</code>。
              </p>
            </div>
          ) : (
            <ErrorBoundary key={current.id}>
              <Suspense fallback={<div className="muted" style={{ padding: 24 }}>加载中…</div>}>
                <section className="panel active">
                  <current.component />
                </section>
              </Suspense>
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}
