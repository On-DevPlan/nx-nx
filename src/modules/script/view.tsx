// 脚本工作台：内置脚本的列表 / 编辑 / 保存 / 运行 / 新建 / 删除。
//
// 设计取舍：
//   - 编辑器先用 textarea：零依赖、够快；需要语法高亮时再换 CodeMirror，不影响 action 契约。
//   - 运行前自动保存：用户看到的是编辑器内容，运行的也必须是它，不能悄悄跑磁盘旧版本。
//   - 所有操作都走 action（/api），因此每个按钮都有等价的 CLI 命令（CliHints 会列出来）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { ScriptEditor } from './editor.js';
import { ScriptSide } from './side-panel.js';
import { LS_KEY, defaultTemplate, loadUi, tokenize } from './helpers.js';
import type { AliasInfo, RunResult, ScriptInfo } from './helpers.js';

export default function ScriptView() {
  const { client } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();

  const savedUi = useMemo(loadUi, []);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [aliases, setAliases] = useState<AliasInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(savedUi.name ?? null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [args, setArgs] = useState('');
  const [tab, setTab] = useState<'output' | 'aliases'>(savedUi.tab ?? 'output');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const dirty = content !== savedContent;
  const working = busy !== null;

  // 刷新后回到原脚本/原 tab——选择也是 UI 状态，不能每次跳回第一个
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ name: selected, tab }));
    } catch {
      /* 隐私模式等场景静默降级 */
    }
  }, [selected, tab]);

  const loadScripts = useCallback(
    async (prefer?: string) => {
      const r = await client['script.list']({});
      setScripts(r.scripts);
      setSelected((prev) => {
        const want = prefer ?? prev;
        return want && r.scripts.some((s) => s.name === want)
          ? want
          : (r.scripts[0]?.name ?? null);
      });
      return r.scripts;
    },
    [client],
  );

  useEffect(() => {
    loadScripts().catch((e: unknown) => setErr(String((e as { message?: string })?.message || e)));
  }, [loadScripts]);

  useEffect(() => {
    client['script.aliases']({})
      .then((r) => setAliases(r.aliases))
      .catch((e: unknown) => setErr(String((e as { message?: string })?.message || e)));
  }, [client]);

  // 选中脚本 → 读源码；切走后丢弃迟到的响应
  useEffect(() => {
    if (!selected) {
      setContent('');
      setSavedContent('');
      setRunResult(null);
      return;
    }
    let alive = true;
    setBusy('load');
    setErr('');
    client['script.read']({ name: selected })
      .then((r) => {
        if (!alive) return;
        setContent(r.content);
        setSavedContent(r.content);
        setRunResult(null);
      })
      .catch((e: unknown) => {
        if (alive) setErr(String((e as { message?: string })?.message || e));
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [selected, client]);

  const selectScript = async (name: string) => {
    if (name === selected) return;
    if (dirty) {
      const ok = await dialog({
        title: '有未保存的修改',
        message: `切换到 ${name}.mjs 会丢失当前修改。`,
        okText: '放弃修改',
        danger: true,
      });
      if (!ok) return;
    }
    setSelected(name);
  };

  const save = useCallback(async (): Promise<boolean> => {
    if (!selected || !dirty || working) return false;
    setBusy('save');
    try {
      await client['script.save']({ name: selected, content });
      setSavedContent(content);
      toast(`已保存 ${selected}.mjs`);
      return true;
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [selected, dirty, working, client, content, toast]);

  const run = useCallback(async () => {
    if (!selected || working) return;
    setTab('output');
    setErr('');
    // 编辑器有改动时先落盘，避免「看到的和跑的不是同一份」
    if (dirty) {
      setBusy('save');
      try {
        await client['script.save']({ name: selected, content });
        setSavedContent(content);
      } catch (e) {
        toast(String((e as { message?: string })?.message || e));
        setBusy(null);
        return;
      }
    }
    setBusy('run');
    try {
      setRunResult(await client['script.run']({ name: selected, args: tokenize(args) }));
    } catch (e) {
      setRunResult({
        script: selected,
        path: '',
        code: 1,
        stdout: '',
        stderr: String((e as { message?: string })?.message || e),
      });
    } finally {
      setBusy(null);
    }
  }, [selected, working, dirty, client, content, args, toast]);

  const create = async () => {
    const raw = await dialog({
      title: '新建脚本',
      message: '脚本名（不含 .mjs）；会写入 assets/scripts/ 并登记 manifest。',
      input: true,
      placeholder: 'my-script',
    });
    if (typeof raw !== 'string') return;
    const name = raw.trim().replace(/\.mjs$/i, '');
    if (!name) return;
    setBusy('create');
    try {
      const r = await client['script.create']({ name, content: defaultTemplate(name) });
      await loadScripts(r.name);
      toast(`已创建 ${r.name}.mjs`);
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await dialog({
      title: '删除脚本',
      message: `删除 ${selected}.mjs 并从 manifest 移除？此操作不可撤销。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await client['script.delete']({ name: selected });
      toast(`已删除 ${selected}.mjs`);
      setSelected(null);
      await loadScripts();
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  // Ctrl/Cmd+S 保存；Ctrl/Cmd+Enter 运行
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') {
        e.preventDefault();
        void save();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, run]);

  const aliasGroups = useMemo(() => {
    const m = new Map<string, AliasInfo[]>();
    for (const a of aliases) {
      const list = m.get(a.group) || [];
      list.push(a);
      m.set(a.group, list);
    }
    return [...m.entries()];
  }, [aliases]);

  const current = scripts.find((s) => s.name === selected);

  return (
    <div className="script-grid">
      <div className="card script-list">
        <div className="colhead">
          <span>脚本</span>
          <span className="acts">
            <span className="tag">{scripts.length}</span>
            <button className="btn small" onClick={create} disabled={working}>
              新建
            </button>
          </span>
        </div>
        <div className="script-list-body">
          {scripts.map((s) => (
            <button
              key={s.name}
              className={'tpl-item' + (s.name === selected ? ' active' : '')}
              onClick={() => selectScript(s.name)}
            >
              <div className="tpl-name mono">{s.name}</div>
              <div className="tpl-desc muted">{s.description || '—'}</div>
            </button>
          ))}
          {!scripts.length && <div className="empty">暂无脚本，点「新建」开始。</div>}
        </div>
        <CliHints module="script" />
      </div>

      <ScriptEditor
        selected={selected}
        path={current?.path}
        content={content}
        dirty={dirty}
        busy={busy}
        args={args}
        err={err}
        onContent={setContent}
        onArgs={setArgs}
        onSave={save}
        onRun={run}
        onDelete={remove}
      />

      <ScriptSide tab={tab} onTab={setTab} runResult={runResult} aliasGroups={aliasGroups} />
      {dialogNode}
    </div>
  );
}
