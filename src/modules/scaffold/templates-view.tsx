// 模板列表视图：只看不建。`describe` 的输出在这里完整展示，
// 包括模板作者写的 README——写模板的人不必再单独维护一份文档站点。
import { useEffect, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useStore } from '../../web/frontend/store.jsx';
import type { MODULES } from '../../runtime/registry.js';
import type { TypedClient } from '../../runtime/types/client.js';

type C = TypedClient<typeof MODULES>;
type DescribeResult = Awaited<ReturnType<C['template.describe']>>;

export default function TemplatesView() {
  const { boot, client } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<DescribeResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!sel) {
      setDetail(null);
      return;
    }
    client['template.describe']({ id: sel })
      .then(setDetail)
      .catch((e: unknown) => setErr(String((e as { message?: string })?.message || e)));
  }, [sel, client]);

  const templates = boot?.templates || [];

  return (
    <div className="create-grid">
      <div className="card">
        <div className="colhead">
          <span>模板</span>
          <span className="tag">{templates.length}</span>
        </div>
        {templates.map((t) => (
          <button
            key={t.id}
            className={'tpl-item' + (t.id === sel ? ' active' : '')}
            onClick={() => setSel(t.id === sel ? null : t.id)}
          >
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-desc muted">{t.description}</div>
          </button>
        ))}
        {!templates.length && <div className="empty">暂无模板</div>}
        {boot?.templateErrors?.length ? (
          <div className="empty bad">
            {boot.templateErrors.map((e) => (
              <div key={e.id}>{e.id}: {e.message}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="colhead">可选项</div>
        {!detail && <div className="empty">← 选一个模板查看</div>}
        {detail && (
          <>
            {(detail.template.options || []).map((o) => (
              <div key={o.name} className="row">
                <div className="name mono">--{o.name}</div>
                <div className="desc">
                  {o.label}
                  {o.hint ? <span className="muted"> · {o.hint}</span> : null}
                </div>
                <div className="acts">
                  <span className="tag">{o.type || 'string'}</span>
                  {o.required && <span className="tag strong">必填</span>}
                </div>
              </div>
            ))}
            <CliHints module="template" />
          </>
        )}
      </div>

      <div className="card">
        <div className="colhead">说明</div>
        <div className="readme-body">
          {err && <div className="bad">{err}</div>}
          {!detail && <div className="empty">← 选一个模板查看</div>}
          {detail && (
            <>
              <div className="snippet-box" style={{ marginBottom: 10 }}>
                <pre>{detail.template.id}</pre>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {detail.readme || '（这个模板还没有 README.md）'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
