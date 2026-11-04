// 顶栏壳：品牌 + 平铺 tab + 分组下拉 + 主题切换，内容区在 <Outlet />。
//
// 这是**一个**壳，不是「面板本身」。旧 App.tsx 把这件事焊死在自己身上，
// 于是想换成左侧栏就得重写整个 App。现在它只是 layouts 里的一格：
// 不喜欢的壳，另写一个文件挂到别的 layout 下即可，页面一行都不用改。
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../../store.js';
import { useNav } from '../nav.js';
import { ThemeToggle, currentTheme } from '../../components/theme.jsx';
import { PageBoundary } from './PageBoundary.js';
import type { NavItem, NavSection } from '../../components/navModel.js';

export default function AppShell() {
  const { boot, settings, refreshBoot } = useStore();
  const { flat, groups } = useNav();

  // 窗口聚焦时刷新：别的终端改了状态（比如 CLI 改了导航配置），这里能看到。
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshBoot().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshBoot]);

  // 色彩主题：写到 <html data-theme>，CSS 按 token 覆盖（light/dark/auto）
  const theme = currentTheme(settings);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const appName = boot?.app?.name || '{{name}}';
  const empty = !flat.length && !groups.length;

  return (
    <>
      <header>
        <div className="brand">
          <img src="/logo-rounded.png" alt="" />
          {appName}
          <span className="ver-tag">{boot ? `v${boot.app.version}` : ''}</span>
          <span className="sub">{boot?.app?.description || '{{description}}'}</span>
        </div>
        <nav>
          {flat.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
            >
              {item.title}
            </NavLink>
          ))}
          {groups.map((g) => (
            <GroupTab key={g.title} group={g} />
          ))}
          {empty && (
            <span className="muted" style={{ padding: '6px 12px' }}>
              暂无视图
            </span>
          )}
        </nav>
        <div className="head-acts">
          <ThemeToggle />
        </div>
      </header>
      <main>
        <PageBoundary>
          <Outlet />
        </PageBoundary>
      </main>
    </>
  );
}

/**
 * 头部的一个**分组入口**：一个 pill 收拢多个页面。
 * 悬浮展开、点击也能开（触屏没有 hover）；点行切换页面。
 * 外点关闭用 `pointerdown`——`click` 与触发按钮自己的 onClick 同阶段冒泡，
 * 会「点一下关了又弹开」；离开延迟关闭 + 菜单上沿补一块透明桥，
 * 否则鼠标从 pill 划向菜单会穿过几像素的空隙被判成离开，菜单刚展开就消失。
 */
function GroupTab({ group }: { group: NavSection }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="tab-group" ref={ref} onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={closeSoon}>
      <button className="tab" aria-expanded={open} onClick={() => { cancelClose(); setOpen(true); }}>
        {group.title}
        <span className="count">{group.items.length}</span>
        <span className="caret" aria-hidden />
      </button>
      {open ? (
        <div className="tab-menu" role="menu">
          {group.items.map((item: NavItem) => (
            <NavLink
              key={item.id}
              to={item.path}
              role="menuitem"
              className={({ isActive }) => 'tab-menu-row' + (isActive ? ' current' : '')}
              onClick={() => { cancelClose(); setOpen(false); }}
            >
              <span className="grow nowrap">{item.title}</span>
            </NavLink>
          ))}
        </div>
      ) : null}
    </span>
  );
}
