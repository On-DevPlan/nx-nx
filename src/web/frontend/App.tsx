// 面板壳：左侧导航 + 顶栏 + 视图区。**这个文件几乎不需要改**——
// 新增面板 = 在 registry.ts 登记一行 + 写一个 view。
//
// 为什么从「顶部横向 tab」换成「左侧栏」：
//   顶部 tab 在四个以上就挤成一行小字，宽度还被品牌名和版本号吃掉；
//   侧栏宽度固定，导航可以带图标与分组，内容区不再随视口抖动。
//   顶栏留给「当前在哪、这页干什么、数据新不新」——三件静态信息。
import { Suspense, useEffect } from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { VIEWS } from './registry.js';
import { useStore } from './store.js';
import { ErrorBoundary } from './components/ui.jsx';

function viewFromHash(): string {
  return location.hash.replace(/^#\/?/, '');
}

export default function App() {
  const { ui, patchUi, boot, refreshBoot } = useStore();
  const views = VIEWS;

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

  const current = views.find((v) => v.id === ui.view) || views[0];
  const appName = boot?.app?.name || 'nx-nx';
  const online = Boolean(boot);

  return (
    <div className="shell">
      <aside className="side">
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
        </div>

        <nav className="side-nav">
          <div className="side-group">工作台</div>
          {views.map((v) => {
            const Icon = v.icon;
            const active = current && current.id === v.id;
            return (
              <button
                key={v.id}
                className={'nav-item' + (active ? ' active' : '')}
                onClick={() => patchUi({ view: v.id })}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="nav-icon" />
                <span className="nav-label">{v.title}</span>
              </button>
            );
          })}
          {views.length === 0 && <span className="muted nav-empty">暂无视图</span>}
        </nav>

        <div className="side-foot">
          <span className={'dot ' + (online ? 'dot-ok' : 'dot-bad')} />
          <span className="mono">{online ? 'serve 在线' : 'serve 离线'}</span>
          <span className="ver-tag">{boot ? `v${boot.app.version}` : ''}</span>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-text">
            <div className="topbar-title">{current ? current.title : '未注册视图'}</div>
            <div className="topbar-hint">{current ? current.hint : '在 registry.ts 登记一个视图'}</div>
          </div>
          <div className="topbar-actions">
            <Tooltip title="重新读取服务端状态（bootstrap）">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => refreshBoot().catch(() => {})}
                aria-label="刷新状态"
              />
            </Tooltip>
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
