// 模板列表视图：只看不建。`describe` 的输出在这里完整展示，
// 包括模板作者写的 README——写模板的人不必再单独维护一份文档站点。
//
// 必填 / 可选的呈现与新建项目面板同源（都走 option-form 的 splitOptions）：
// 一个视图说「可选项」却把必填项混在里面列出，用户没法判断哪些是非填不可的。
import { useEffect, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useStore } from '../../web/frontend/store.jsx';
import { splitOptions } from './option-form.js';
import type { MODULES } from '../../runtime/registry.js';
import type { TypedClient } from '../../runtime/types/client.js';
import type { OptionSpec } from '../../core/templates.js';

type C = TypedClient<typeof MODULES>;
type DescribeResult = Awaited<ReturnType<C['template.describe']>>;

function OptionRows({ title, items }: { title: string; items: OptionSpec[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="opt-group-head">
        <span>{title}</span>
        <span className="opt-group-count">{items.length}</span>
      </div>
      {items.map((o) => (
        <div key={o.name} className="row">
          <div className="name mono">--{o.name}</div>
          <div className="desc">
            {o.label || o.name}
            {o.hint ? <span className="muted"> · {o.hint}</span> : null}
          </div>
          <div className="acts">
            <span className="tag">{o.type || 'string'}</span>
            {o.required ? (
              <span className="tag strong">必填</span>
            ) : (
              <span className="tag">选填</span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function OptionGroupList({ detail }: { detail: DescribeResult }) {
  const { required, optional } = splitOptions(detail.template.options || []);
  return (
    <div className="opt-list">
      <OptionRows title="必填" items={required} />
      <OptionRows title="可选" items={optional} />
    </div>
  );
}

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
        <div className="colhead">选项</div>
        {!detail && <div className="empty">← 选一个模板查看</div>}
        {detail && (
          <>
            <OptionGroupList detail={detail} />
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
