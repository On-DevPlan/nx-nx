// 看板列表：一个**不碰后端**的页面。
//
// 存在两个意义：
//   ① 证明页面可以零 action —— 不是每个视图都需要一条 HTTP 路由 + 一条 CLI 命令；
//   ② 证明「左侧栏壳」是真能跑起来的，而不是图纸。
//
// 换成真业务时，把 ITEMS 换成 api.ts 里的 client['域.action']() 即可，
// 页面结构不用动。
import { Link } from 'react-router-dom';

const ITEMS = [
  { id: 'a1', title: '今天要做的三件事', desc: '演示详情页：路由参数 + 不写 nav 就不进导航' },
  { id: 'b2', title: '本周复盘', desc: '同一个列表在两种壳下表现一致' },
  { id: 'c3', title: '待归档', desc: '页面与壳完全解耦' },
];

export default function BoardPage() {
  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="card">
        <div className="colhead">
          看板
          <span className="right muted">这个页面挂在 sidebar 壳下，且不调用任何 action</span>
        </div>
        <div style={{ padding: 12 }} className="stack">
          {ITEMS.map((it) => (
            <Link key={it.id} to={'/board/' + it.id} className="row nav-row" style={{ textDecoration: 'none' }}>
              <span className="name">{it.title}</span>
              <span className="desc">{it.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="muted">
        切回顶栏壳下的页面，导航照样在——两种壳共存，互不知道对方存在。
      </div>
    </div>
  );
}
