// 左侧栏壳：一个**完全不同**的版式，用来证明「特殊 UI 不用重写」。
//
// 它和 AppShell 除了都调 useNav() 之外没有任何共用逻辑：
// 版式、分组呈现、当前项高亮全部自己决定。页面组件对此毫不知情——
// 同一个 pages/<名>/index.tsx 可以同时挂在两种壳下（见 router.ts 的 layout 字段）。
//
// 加第三/第四种壳（分栏、全屏画布、命令面板）的成本就是再加一个这样的文件 +
// 在 layouts.ts 里加一行，既有页面零改动。
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../../../store.js';
import { useNav } from '../../nav.js';
import { ThemeToggle, currentTheme } from '../../../components/theme/index.js';
import { PageBoundary } from '../page-boundary/index.js';

export default function SidebarShell() {
  const { boot, settings } = useStore();
  const { flat, groups } = useNav();
  const { pathname } = useLocation();

  const theme = currentTheme(settings);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 文档标题跟着当前壳走：两种壳共存时，标签页标题能分辨。
  useEffect(() => {
    const name = boot?.app?.name || '{{name}}';
    document.title = name + ' · 侧栏';
  }, [boot]);

  const appName = boot?.app?.name || '{{name}}';
  const cls = (active: boolean) => 'side-item' + (active ? ' active' : '');

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <img src="/logo-rounded.png" alt="" />
          <span className="nowrap">{appName}</span>
        </div>

        <nav className="side-nav">
          {flat.map((item) => (
            <NavLink key={item.id} to={item.path} end={item.path === '/'} className={({ isActive }) => cls(isActive)}>
              {item.title}
            </NavLink>
          ))}

          {groups.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-group-title">{g.title}</div>
              {g.items.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) => cls(isActive) + ' nested'}
                >
                  {item.title}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <span className="muted mono nowrap" title={pathname}>{pathname}</span>
          <ThemeToggle />
        </div>
      </aside>

      <main className="side-main">
        <PageBoundary>
          <Outlet />
        </PageBoundary>
      </main>
    </div>
  );
}
