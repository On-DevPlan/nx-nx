// 新建项目面板：左侧选模板 → 中间按 schema 自动生成表单 → 右侧 logo 实时预览。
//
// 设计要点（与 vue ui 的差别）：这里**不猜**任何字段含义，完全由模板的
// option schema 驱动渲染。模板加一个选项，面板自动多一个控件，不需要改这个文件。
// 这也是「通用模板管理器」相对「写死一个生成器」的核心收益。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../web/frontend/api/client.js';
import { CliHints } from '../../web/frontend/components/CliHints.jsx';
import { useToast, useDialog } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';

// scheme 的中文名与色值——**只用于预览渲染**，真实取值仍以模板钩子为准。
// 面板必须能在没有网络/没有模板钩子的情况下画出预览，所以这里留一份展示用副本。
const SCHEME_PREVIEW = {
  klein: { name: '克莱因蓝', bg: '#002EA6', fg: '#FFE76F' },
  mars: { name: '马尔斯绿', bg: '#01847F', fg: '#F9D2E4' },
  hermes: { name: '爱马仕橙', bg: '#FF770F', fg: '#000026' },
  tiffany: { name: '蒂芙尼蓝', bg: '#80D1C8', fg: '#F8F5D6' },
  red: { name: '中国红', bg: '#FF0000', fg: '#FAEAD3' },
  vandyke: { name: '凡戴克棕', bg: '#492D22', fg: '#D8C7B5' },
  prussian: { name: '普鲁士蓝', bg: '#003153', fg: '#E5DDD7' },
};

// 按 option.type 选控件。新增类型时**只需在这里加一条**——
// 这正是 schema 驱动的好处：控件映射集中一处，而不是散在每个表单里。
function OptionField({ opt, value, onChange }) {
  const label = opt.label || opt.name;
  const common = { id: `opt-${opt.name}`, value: value ?? '', onChange: (e) => onChange(e.target.value) };

  if (opt.type === 'boolean') {
    return (
      <label className="opt-row" htmlFor={common.id}>
        <input type="checkbox" id={common.id} checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="opt-label">{label}</span>
      </label>
    );
  }

  if (opt.type === 'enum') {
    return (
      <div className="opt-row">
        <label className="opt-label" htmlFor={common.id}>{label}</label>
        <select {...common}>
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
      <label className="opt-label" htmlFor={common.id}>
        {label}
        {opt.required && <span className="req">*</span>}
      </label>
      <input
        {...common}
        type={opt.type === 'number' ? 'number' : 'text'}
        placeholder={opt.default != null ? String(opt.default) : ''}
      />
      {opt.hint && <div className="opt-hint">{opt.hint}</div>}
    </div>
  );
}

// logo 实时预览：内联 SVG，改字母/配色立刻重绘。
// 与生成器用的是**同一套几何规则**（圆角、字号占比、颜色），
// 但这里是简化的单行文本——预览只需表意，不必像素级复刻点阵字模。
function LogoPreview({ letters, scheme, size = 96 }) {
  const s = SCHEME_PREVIEW[scheme] || SCHEME_PREVIEW.mars;
  const text = String(letters || '').slice(0, 5);
  const fontSize = Math.round((size * 0.72) / Math.max(1, text.length) / 0.62);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="logo-preview">
      <rect width={size} height={size} rx={size * 0.22} ry={size * 0.22} fill={s.bg} />
      <text
        x="50%"
        y="50%"
        fill={s.fg}
        fontSize={fontSize}
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Verdana, 'Segoe UI', Arial, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}

export default function CreateView() {
  const { boot } = useStore();
  const toast = useToast();
  const dialog = useDialog();

  const [tplId, setTplId] = useState('');
  const [tpl, setTpl] = useState(null);
  const [values, setValues] = useState({});
  const [outDir, setOutDir] = useState('');
  const [dirState, setDirState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const dirTimer = useRef(null);

  const templates = boot?.templates || [];

  // 模板列表就绪后自动选中第一个，省掉一次无意义的点击
  useEffect(() => {
    if (!tplId && templates.length) setTplId(templates[0].id);
  }, [templates, tplId]);

  // 加载模板详情（含 hook 解析出的动态选项）
  useEffect(() => {
    if (!tplId) return;
    let alive = true;
    api(`/api/templates/${encodeURIComponent(tplId)}`)
      .then((r) => {
        if (!alive) return;
        setTpl(r.template);
        // 用默认值预填表单——用户不改就能直接生成
        const init = {};
        for (const o of r.template.options || []) {
          if (o.default !== undefined && o.default !== null) init[o.name] = o.default;
        }
        setValues(init);
      })
      .catch((e) => toast(String(e.message || e), 'bad'));
    return () => {
      alive = false;
    };
  }, [tplId, toast]);

  const letters = String(values.letters || '');
  const scheme = values.scheme || 'mars';

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
      api('/api/check-dir', { method: 'POST', body: { dir: outDir } })
        .then(setDirState)
        .catch(() => setDirState(null));
    }, 400);
    return () => clearTimeout(dirTimer.current);
  }, [outDir]);

  const setOpt = useCallback((name, v) => setValues((s) => ({ ...s, [name]: v })), []);

  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/templates/${encodeURIComponent(tplId)}/preview`, {
        method: 'POST',
        body: { ...values, dir: outDir },
      });
      setPreview(r);
      setResult(null);
    } catch (e) {
      toast(String(e.message || e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    if (!letters) {
      toast('请先填项目字母', 'bad');
      return;
    }
    const ok = await dialog.confirm({
      title: '确认生成',
      message: `将在以下目录创建 ${preview?.count ?? '若干'} 个文件：\n${outDir}\n\n生成器不会覆盖已有内容；目录非空会被拒绝。`,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const r = await api(`/api/templates/${encodeURIComponent(tplId)}/create`, {
        method: 'POST',
        body: { ...values, dir: outDir },
      });
      setResult(r);
      setPreview(null);
      toast(`已创建 ${r.count} 个文件`);
    } catch (e) {
      toast(String(e.message || e), 'bad');
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

        <CliHints
          command={`nx-nx template create ${tplId || '<id>'} --letters ${letters || '<字母>'}`}
          note="面板与 CLI 走同一条 action，结果一致"
        />
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
              {result.extra?.note && <div className="muted" style={{ fontSize: 11 }}>{result.extra.note}</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>下一步（复制执行）</div>
              <div className="snippet-box" style={{ marginTop: 4 }}>
                <pre>{result.nextSteps.join('\n')}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
