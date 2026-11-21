// 左侧栏壳：**默认壳**（DEFAULT_LAYOUT = 'sidebar'）。
//
// 顶栏 tab 的毛病是「一多就挤」：四个页面还能看，八个页面就变成一行小字，
// 宽度还要跟品牌名和版本号分。侧栏把导航竖过来，页面按业务关系分组，
// 组与组之间有分隔线、组内有一条竖直关系线——一眼看得出「谁和谁是一类」。
//
// 三件交互（都持久化到 localStorage，刷新不丢）：
//   1. 拖拽右边界改宽（168–360px）
//   2. 「完全展开 / 收起为图标栏」一键切换（收起态 56px，只剩图标 + title 提示）
//   3. 每组可单独折叠；「完全展开」按钮同时展开所有组并把侧栏拉到记住的宽度
//
// 它和 AppShell 除了都调 useNav() 之外没有任何共用逻辑：版式、分组呈现、
// 当前项高亮全部自己决定。页面组件对此毫不知情——同一个 pages/<名>/index.tsx
// 可以同时挂在两种壳下（见 routes/*.ts 的 layout 字段）。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderPlus,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Server,
  Settings,
  SquareCode,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../../../store.js';
import { useNav } from '../../nav.js';
import { ThemeToggle, currentTheme } from '../../../components/theme/index.js';
import { PageBoundary } from '../page-boundary/index.js';

const MIN_W = 168;
const MAX_W = 360;
const DEFAULT_W = 220;
const RAIL_W = 56;
const PREF_KEY = '{{letters}}-side-pref';

/** 页面 id → 图标：新页面没登记时退回 FileText，不会因为没图标就不显示 */
// 页面 id → 图标。模板只带 home / board 两条路由，但常见业务页先映射好：
// 新加 routes/<名>.ts 时不用改这个文件，图标直接接上；未知 id 回退 FileText。
const PAGE_ICONS: Record<string, LucideIcon> = {
  home: Home,
  board: LayoutDashboard,
  dashboard: LayoutDashboard,
  scripts: SquareCode,
  services: Server,
  templates: LayoutTemplate,
  create: FolderPlus,
  settings: Settings,
  logs: ScrollText,
  docs: BookOpen,
  report: BarChart3,
};

interface SidePref {
  width: number;
  open: boolean;
}

function readPref(): SidePref {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Partial<SidePref>;
    return {
      width: Math.min(MAX_W, Math.max(MIN_W, Number(raw.width) || DEFAULT_W)),
      open: raw.open !== false,
    };
  } catch {
    return { width: DEFAULT_W, open: true };
  }
}

export default function SidebarShell() {
  const { boot, settings } = useStore();
  const { flat, groups } = useNav();
  const { pathname } = useLocation();

  const [pref, setPref] = useState<SidePref>(readPref);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const drag = useRef<{ x: number; w: number } | null>(null);

  const theme = currentTheme(settings);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  }, [pref]);

  // 文档标题跟着当前壳走：两种壳共存时，标签页标题能分辨。
  useEffect(() => {
    const name = boot?.app?.name || '{{name}}';
    document.title = name + ' · 侧栏';
  }, [boot]);

  const appName = boot?.app?.name || '{{name}}';
  const width = pref.open ? pref.width : RAIL_W;
  const iconOf = (id: string): LucideIcon => PAGE_ICONS[id] ?? FileText;
  const total = useMemo(() => flat.length + groups.reduce((n, g) => n + g.items.length, 0), [flat, groups]);

  const clamp = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
  const expandAll = () => setPref((p) => ({ ...p, open: true }));
  const toggleGroup = (title: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <div className="shell" style={{ '--side-w': `${width}px` } as CSSProperties}>
      <aside className={'side' + (pref.open ? '' : ' side-collapsed')}>
        <div className="side-brand">
          <img src="/logo-rounded.png" alt="" />
          <span className="nowrap side-brand-name">{appName}</span>
          <button
            type="button"
            className="side-toggle"
            aria-label={pref.open ? '收起为图标栏' : '完全展开侧栏'}
            title={pref.open ? '收起为图标栏' : '完全展开侧栏'}
            onClick={() => setPref((p) => ({ ...p, open: !p.open }))}
          >
            {pref.open ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        <nav className="side-nav" aria-label="主导航">
          {total === 0 && <span className="muted side-empty">暂无视图</span>}

          {flat.map((item) => {
            const Icon = iconOf(item.id);
            return (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => 'side-item' + (isActive ? ' active' : '')}
                title={pref.open ? undefined : item.title}
              >
                <Icon size={15} strokeWidth={1.9} />
                <span className="side-item-label nowrap">{item.title}</span>
              </NavLink>
            );
          })}

          {groups.map((g) => {
            const isClosed = closed.has(g.title);
            return (
              <section key={g.title} className={'side-group' + (isClosed ? ' folded' : '')}>
                <button
                  type="button"
                  className="side-group-title"
                  aria-expanded={!isClosed}
                  onClick={() => toggleGroup(g.title)}
                  title={pref.open ? undefined : g.title}
                >
                  {isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Boxes size={13} />
                  <span className="nowrap side-group-name">{g.title}</span>
                  <span className="side-count">{g.items.length}</span>
                </button>
                {!isClosed && (
                  <div className="side-group-items">
                    {g.items.map((item) => {
                      const Icon = iconOf(item.id);
                      return (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          className={({ isActive }) => 'side-item nested' + (isActive ? ' active' : '')}
                          title={pref.open ? undefined : item.title}
                        >
                          <Icon size={15} strokeWidth={1.9} />
                          <span className="side-item-label nowrap">{item.title}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="side-foot">
          <span className="muted mono nowrap side-path" title={pathname}>{pathname}</span>
          <ThemeToggle />
        </div>

        {/* 拖拽把手：命中区 8px，可见线只在 hover/聚焦时出现 */}
        <div
          className="side-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整侧栏宽度（双击恢复默认）"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={pref.open ? pref.width : RAIL_W}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            drag.current = { x: e.clientX, w: pref.width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setPref({ width: clamp(drag.current.w + e.clientX - drag.current.x), open: true });
          }}
          onPointerUp={(e) => {
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onDoubleClick={() => setPref({ width: DEFAULT_W, open: true })}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPref((p) => ({ width: clamp(p.width - 16), open: true }));
            else if (e.key === 'ArrowRight') setPref((p) => ({ width: clamp(p.width + 16), open: true }));
            else if (e.key === 'Home') setPref({ width: DEFAULT_W, open: true });
            else if (e.key === 'Enter' || e.key === ' ') expandAll();
            else return;
            e.preventDefault();
          }}
        />
      </aside>

      <main className="side-main">
        <PageBoundary>
          <Outlet />
        </PageBoundary>
      </main>
    </div>
  );
}
