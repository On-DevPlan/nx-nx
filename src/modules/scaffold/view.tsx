// 新建项目面板：左侧选模板 → 中间按 schema 自动生成表单 → 右侧 logo 实时预览。
//
// 设计要点（与写死一个生成器的差别）：这里**不猜**任何字段含义，完全由模板的
// option schema 驱动渲染。模板加一个选项，面板自动多一个控件，不需要改这个文件。
// 这也是「通用模板管理器」相对「写死一个生成器」的核心收益。
//
// 所有请求走类型安全 client：action id、路由参数、flag 值类型、返回数据
// 全部由注册表类型推出，写错在编译期就红。
//
// 核心约束：**面板不认识任何具体的选项名**。必填与否、能不能点「生成项目」、
// 输出目录叫什么，全部由模板的 option schema + resolveVars 的同一套规则推出
// （判定逻辑见 option-form.ts）。曾经这里写死 `letters`——那是 server-cli-web
// 家族的专属字段，mono-gf（name）与 std-a-lang（lang）因此永远点不动。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useToast, useDialog } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { LogoPreview, SCHEME_PREVIEW } from './logo-preview.js';
import { OptionField } from './option-field.js';
import { blockingIssues, describeIssues, splitOptions, suggestProjectName } from './option-form.js';
import type { OptionIssue, OptionValues } from './option-form.js';
import type { MODULES } from '../../runtime/registry.js';
import type { TypedClient } from '../../runtime/types/client.js';
import type { OptionSpec, TemplateMeta } from '../../core/templates.js';

type C = TypedClient<typeof MODULES>;
type DescribeResult = Awaited<ReturnType<C['template.describe']>>;
type PreviewResult = Awaited<ReturnType<C['template.preview']>>;
type CreateResult = Awaited<ReturnType<C['template.create']>>;
type CheckDirResult = Awaited<ReturnType<C['template.checkdir']>>;

// 一组同性质的选项（必填 / 可选）。没有选项的组直接不渲染——
// 空标题只会让人以为模板缺东西。
function OptionGroup({
  title,
  items,
  values,
  onChange,
}: {
  title: string;
  items: OptionSpec[];
  values: OptionValues;
  onChange: (name: string, v: unknown) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="opt-group">
      <div className="opt-group-head">
        <span>{title}</span>
        <span className="opt-group-count">{items.length}</span>
      </div>
      {items.map((o) => (
        <OptionField key={o.name} opt={o} value={values[o.name]} onChange={(v) => onChange(o.name, v)} />
      ))}
    </div>
  );
}

// siblings 模板缺输出目录时的固定阻塞项——同 issues 形态，让按钮门禁与底部提示走同一通道。
function missingDirIssue(): OptionIssue {
  return { kind: 'missing', name: 'dir', label: '输出目录', message: 'a_<lang>/ 们的父目录（必填，空目录）' };
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

  const scheme = String(values.scheme || 'mars');
  const opts = tpl?.options || [];
  const { required, optional } = splitOptions(opts);
  const issues = blockingIssues(opts, values);

  // 项目名：由 schema 推（letters / name / 第一个必填项 + namePrefix），
  // 推不出就留空——让用户自己填目录，比猜一个错名字强。
  const projectName = useMemo(() => suggestProjectName(tpl, values), [tpl, values]);

  // siblings 模板（outputMode='siblings'）的输出目录是 a_<lang>/ 们的父目录，必须用户填——
  // 不能按 projectName 猜 a_ts，那会嵌出 a_ts/a_ts。
  const siblingsMode = tpl?.outputMode === 'siblings';
  // siblings + 空 outDir = 多一条阻塞，走 issues 单一来源让按钮与底部提示同源。
  const allIssues = siblingsMode && !outDir ? [...issues, missingDirIssue()] : issues;

  // 默认跟着 projectName 走，siblings 留空；用户改过就不再自动覆盖
  const dirTouched = useRef(false);
  useEffect(() => {
    if (dirTouched.current) return;
    setOutDir(siblingsMode ? '' : projectName);
  }, [projectName, siblingsMode]);

  // logo 预览用字母；没有 letters 的模板从项目名里取（mono-gf 的项目名就很够看）
  const logoLetters =
    String(values.letters || '') ||
    projectName.replace(/[^A-Za-z]/g, '').toLowerCase().slice(0, 5) ||
    '?';

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
    // 按钮已按 allIssues 禁用；这里是给键盘/竞态留的兜底，提示语与按钮下方同一套
    if (allIssues.length) {
      toast(describeIssues(allIssues));
      return;
    }
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
    if (!tpl) {
      toast('请先选一个模板');
      return;
    }
    // 同一个 issues 判定，不认具体选项名：缺 name 的 mono-gf 与缺 lang 的
    // std-a-lang 在这里走的是同一条分支（此前这里写死 letters，两者永远走不到）。
    if (allIssues.length) {
      toast(describeIssues(allIssues));
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
          {/* 必填在前、可选在后：填到哪儿、还差什么，一眼能看完 */}
          <OptionGroup title="必填" items={required} values={values} onChange={setOpt} />
          <OptionGroup title="可选" items={optional} values={values} onChange={setOpt} />

          <div className="opt-row">
            <label className="opt-label" htmlFor="opt-dir">
              输出目录
              {siblingsMode ? <span className="req" title="必填">*</span> : <span className="opt-badge">选填</span>}
            </label>
            <input
              id="opt-dir"
              value={outDir}
              onChange={(e) => {
                dirTouched.current = true;
                setOutDir(e.target.value);
              }}
            />
            <div className="opt-hint">
              {siblingsMode
                ? 'a_<lang>/ 们的父目录（必填、空目录，生成器拒绝非空）'
                : projectName
                  ? `留空则用项目名 ${projectName}（相对当前工作目录）`
                  : '留空则用模板推导的项目名'}
            </div>
            {dirState && (
              <div className={'opt-hint' + (dirState.usable ? '' : ' bad')}>
                {dirState.usable
                  ? (dirState.exists ? '目录已存在但为空，可用' : '目录不存在，将新建')
                  : `目录非空（${dirState.entries} 项），生成器会拒绝——请换一个`}
              </div>
            )}
          </div>
        </div>

        {/* 灰着的按钮必须说清自己在等什么：只禁用不解释，用户只能干瞪眼 */}
        {allIssues.length > 0 && <div className="opt-blocked">{describeIssues(allIssues)}</div>}

        <div className="opt-actions">
          <button className="btn ghost" onClick={doPreview} disabled={busy || !tpl || allIssues.length > 0}>
            预览文件
          </button>
          <button
            className="btn"
            onClick={doCreate}
            disabled={busy || !tpl || allIssues.length > 0 || dirState?.usable === false}
          >
            生成项目
          </button>
        </div>

        <CliHints module="template" />
      </div>

      {/* ---- 右：预览 ---- */}
      <div className="card">
        <div className="colhead">预览</div>
        <div className="preview-body">
          {/* 模板声明 logo:false（纯目录骨架等）就不画 logo 与撞色行——是否画是模板的事实，面板照办。 */}
          {tpl?.logo !== false && (
            <>
              <LogoPreview letters={logoLetters} scheme={scheme} />
              <div className="muted" style={{ fontSize: 11 }}>
                {SCHEME_PREVIEW[scheme]?.name || scheme} · {SCHEME_PREVIEW[scheme]?.bg}
              </div>
            </>
          )}
          <div className="preview-name mono">{projectName || '??'}</div>

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
