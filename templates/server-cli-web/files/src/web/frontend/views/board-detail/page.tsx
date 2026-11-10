// 看板详情：从路由参数拿 id，不做任何登记。
//
// 关键点：这个页面没有 nav 字段，所以它**天然不出现在导航里**——
// 不需要「隐藏清单」，也不需要只为它单独加一个 id。
import { Link, useParams } from 'react-router-dom';

export default function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="card">
        <div className="colhead">
          看板详情
          <span className="right muted mono">/board/{id}</span>
        </div>
        <div style={{ padding: 12 }} className="stack">
          <dl className="kv">
            <div className="kv-row">
              <dt>路由参数</dt>
              <dd className="mono">{id}</dd>
            </div>
            <div className="kv-row">
              <dt>导航</dt>
              <dd>未声明 nav，因此不出现在任何导航里；深链与刷新都可用</dd>
            </div>
          </dl>
          <div>
            <Link to="/board">返回看板</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
