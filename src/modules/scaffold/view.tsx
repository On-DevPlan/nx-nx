// 新建项目面板：左侧选模板 → 中间按 schema 自动生成表单 → 右侧 logo 实时预览。
//
// 设计要点（与写死一个生成器的差别）：这里**不猜**任何字段含义，完全由模板的
// option schema 驱动渲染。模板加一个选项，面板自动多一个控件，不需要改这个文件。
// 这也是「通用模板管理器」相对「写死一个生成器」的核心收益。
//
// 所有请求走类型安全 client：action id、路由参数、flag 值类型、返回数据
// 全部由注册表类型推出，写错在编译期就红。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useToast, useDialog } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { LogoPreview, SCHEME_PREVIEW } from './logo-preview.js';
import type { MODULES } from '../../runtime/registry.js';
import type { TypedClient } from '../../runtime/types/client.js';
import type { OptionSpec, TemplateMeta } from '../../core/templates.js';

type C = TypedClient<typeof MODULES>;
type DescribeResult = Awaited<ReturnType<C['template.describe']>>;
type PreviewResult = Awaited<ReturnType<C['template.preview']>>;
type CreateResult = Awaited<ReturnType<C['template.create']>>;
type CheckDirResult = Awaited<ReturnType<C['template.checkdir']>>;

// 按 option.type 选控件。新增类型时**只需在这里加一条**——
// 这正是 schema 驱动的好处：控件映射集中一处，而不是散在每个表单里。
function OptionField({
  opt,
  value,
  onChange,
}: {
  opt: OptionSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = opt.label || opt.name;
  const id = `opt-${opt.name}`;

  if (opt.type === 'boolean') {
    return (
      <label className="opt-row" htmlFor={id}>
        <input type="checkbox" id={id} checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="opt-label">{label}</span>
      </label>
    );
  }

  if (opt.type === 'enum') {
    return (
      <div className="opt-row">
        <label className="opt-label" htmlFor={id}>{label}</label>
        <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(opt.values || []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {opt.hint && <div className="opt-hint">{opt.hint}</div>}
      </div>
    );
  }

  return (
    <div className="opt-row">
      <label className="opt-label" htmlFor={id}>
        {label}
        {opt.required && <span className="req">*</span>}
      </label>
      <input
        id={id}
        value={String(value ?? '')}
        type={opt.type === 'number' ? 'number' : 'text'}
        placeholder={opt.default != null ? String(opt.default) : ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {opt.hint && <div className="opt-hint">{opt.hint}</div>}
    </div>
  );
}

export default function CreateView() {
  const { boot, client } = useStore();
  const toast = useToast();
  // useDialog() 返回 { dialog(打开函数), node(要渲染的弹窗 DOM) }——必须解构。
  const { dialog, node: dialogNode } = useDialog();

  const [tplId, setTplId] = useState('');
  const [tpl, setTpl] = useState<TemplateMeta | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [outDir, setOutDir] = useState('');
  const [dirState, setDirState] = useState<CheckDirResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const dirTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templates = boot?.templates || [];

  // 模板列表就绪后自动选中第一个，省掉一次无意义的点击
  useEffect(() => {
    if (!tplId && templates.length) setTplId(templates[0]!.id);
  }, [templates, tplId]);

  // 加载模板详情（含 hook 解析出的动态选项）
  useEffect(() => {
    if (!tplId) return;
    let alive = true;
    client['template.describe']({ id: tplId })
      .then((r: DescribeResult) => {
        if (!alive) return;
        setTpl(r.template);
        // 用默认值预填表单——用户不改就能直接生成
        const init: Record<string, unknown> = {};
        for (const o of r.template.options || []) {
          if (o.default !== undefined && o.default !== null) init[o.name] = o.default;
        }
        setValues(init);
      })
      .catch((e: unknown) => toast(String((e as { message?: string })?.message || e)));
    return () => {
      alive = false;
    };
  }, [tplId, toast, client]);

  const letters = String(values.letters || '');
  const scheme = String(values.scheme || 'mars');

  // 输出目录：默认跟着字母走，用户改过就不再自动覆盖
  const suggestedDir = useMemo(() => {
    const prefix = tpl?.namePrefix || '';
    return letters ? prefix + letters : '';
  }, [tpl, letters]);

  const dirTouched = useRef(false);
  useEffect(() => {
    if (!dirTouched.current) setOutDir(suggestedDir);
  }, [suggestedDir]);

  // 目录可用性即时检查（防抖 400ms，避免每敲一个字都打接口）
  useEffect(() => {
    if (dirTimer.current) clearTimeout(dirTimer.current);
    if (!outDir) {
      setDirState(null);
      return;
    }
    dirTimer.current = setTimeout(() => {
      client['template.checkdir']({ dir: outDir })
        .then(setDirState)
        .catch(() => setDirState(null));
    }, 400);
    return () => {
      if (dirTimer.current) clearTimeout(dirTimer.current);
    };
  }, [outDir, client]);

  const setOpt = useCallback((name: string, v: unknown) =>
    setValues((s) => ({ ...s, [name]: v })), []);

  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await client['template.preview']({ id: tplId, ...values, dir: outDir });
      setPreview(r);
      setResult(null);
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    if (!letters) {
      toast('请先填项目字母');
      return;
    }
    // 手动开确认框：node 渲染在组件根部，用户点「确定」resolve(true)。
    const ok = await dialog({
      title: '确认生成',
      message: `将在以下目录创建 ${preview?.count ?? '若干'} 个文件：\n${outDir}\n\n生成器不会覆盖已有内容；目录非空会被拒绝。`,
      okText: '生成',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const r = await client['template.create']({ id: tplId, ...values, dir: outDir });
      setResult(r);
      setPreview(null);
      toast(`已创建 ${r.count} 个文件`);
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!templates.length) {
    return (
      <div className="empty">
        还没有可用模板。在 <code>templates/&lt;id&gt;/</code> 下建一个（含 <code>template.json</code> 与{' '}
        <code>files/</code>）。
        {boot?.templateErrors?.length ? (
          <div className="bad" style={{ marginTop: 8 }}>
            {boot.templateErrors.map((e) => (
              <div key={e.id}>{e.id}: {e.message}</div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const opts = tpl?.options || [];

  return (
    <>
      {/* useDialog 的弹窗 DOM 必须由调用方渲染——不渲染 node，dialog() 的
          Promise 永远不会 resolve，按钮就"点了没反应" */}
      {dialogNode}
      <div className="create-grid">
      {/* ---- 左：模板选择 ---- */}
      <div className="card">
        <div className="colhead">模板</div>
        {templates.map((t) => (
          <button
            key={t.id}
            className={'tpl-item' + (t.id === tplId ? ' active' : '')}
            onClick={() => {
              setTplId(t.id);
              dirTouched.current = false;
              setPreview(null);
              setResult(null);
            }}
          >
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-desc muted">{t.description}</div>
          </button>
        ))}
      </div>

      {/* ---- 中：表单 ---- */}
      <div className="card">
        <div className="colhead">
          <span>选项</span>
          <span className="tag mono">{tplId}</span>
        </div>
        <div className="opt-body">
          {opts.map((o) => (
            <OptionField key={o.name} opt={o} value={values[o.name]} onChange={(v) => setOpt(o.name, v)} />
          ))}

          <div className="opt-row">
            <label className="opt-label" htmlFor="opt-dir">输出目录</label>
            <input
              id="opt-dir"
              value={outDir}
              onChange={(e) => {
                dirTouched.current = true;
                setOutDir(e.target.value);
              }}
            />
            {dirState && (
              <div className={'opt-hint' + (dirState.usable ? '' : ' bad')}>
                {dirState.usable
                  ? (dirState.exists ? '目录已存在但为空，可用' : '目录不存在，将新建')
                  : `目录非空（${dirState.entries} 项），生成器会拒绝——请换一个`}
              </div>
            )}
          </div>
        </div>

        <div className="opt-actions">
          <button className="btn ghost" onClick={doPreview} disabled={busy || !letters || !tpl}>
            预览文件
          </button>
          <button className="btn" onClick={doCreate} disabled={busy || !letters || !tpl || dirState?.usable === false}>
            生成项目
          </button>
        </div>

        <CliHints module="template" />
      </div>

      {/* ---- 右：预览 ---- */}
      <div className="card">
        <div className="colhead">预览</div>
        <div className="preview-body">
          <LogoPreview letters={letters || '?'} scheme={scheme} />
          <div className="preview-name mono">
            {(tpl?.namePrefix || '') + (letters || '??')}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {SCHEME_PREVIEW[scheme]?.name || scheme} · {SCHEME_PREVIEW[scheme]?.bg}
          </div>

          {preview && (
            <>
              <div className="preview-sep" />
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                将创建 {preview.count} 个文件
              </div>
              <div className="file-list mono">
                {preview.files.map((f) => (
                  <div key={f}>{f}</div>
                ))}
              </div>
            </>
          )}

          {result && (
            <>
              <div className="preview-sep" />
              <div className="ok-line">已创建 {result.count} 个文件</div>
              {(() => {
                const extra = result.extra as { note?: string } | null;
                return extra?.note ? (
                  <div className="muted" style={{ fontSize: 11 }}>{extra.note}</div>
                ) : null;
              })()}
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>下一步（复制执行）</div>
              <div className="snippet-box" style={{ marginTop: 4 }}>
                <pre>{result.nextSteps.join('\n')}</pre>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
