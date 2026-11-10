// 404：路由表里没有这条路径。
//
// 旧骨架把「找不到视图」和「清单里有但没登记组件」揉成两句提示文案，
// 后者本身就是设计缺陷的产物（清单与组件表要人工对齐）。现在只有一种情况：
// 这个路径没有对应页面——写清楚当前路径和怎么回去就够了。
import { Link, useLocation } from 'react-router-dom';
import { NAV_PAGES } from '../pages.js';

export default function NotFound() {
  const { pathname } = useLocation();
  const first = NAV_PAGES[0];

  return (
    <div className="empty">
      <p>
        没有这个页面：<code className="mono">{pathname}</code>
      </p>
      <p className="muted">
        新建 <code className="mono">routes/&lt;名&gt;.ts（页面本体 pages/&lt;名&gt;/index.tsx）</code> 即可加一页，
        不需要在别处登记。
      </p>
      {first ? (
        <p>
          <Link to={first.def.path}>回到「{first.title}」</Link>
        </p>
      ) : null}
    </div>
  );
}
