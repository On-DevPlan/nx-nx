// 脚本工作台的状态与动作（无 JSX，只产出给视图用）。
//
// 抽出来的原因有两个：视图文件有 300 行上限，而编辑器 / 日志这些库的接线
// 本来就该和「怎么摆」分开——布局改版时不该碰数据逻辑，反之亦然。
//
// 「选中后拿什么」在 use-script-content.tsx；这里只管动作与两条通道的编排。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { useScriptContent } from './use-script-content.js';
import { LS_KEY, customArgTokens, defaultTemplate, loadUi, paramTokens } from './helpers.js';
import type { AliasInfo, HeapRow, RunRecord, RunResult, SandboxResult, ScriptInfo, SideTab } from './helpers.js';

const KIND_ORDER: ScriptInfo['kind'][] = ['long', 'short', 'shared'];

export function useWorkbench() {
  const { client } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();

  const savedUi = useMemo(loadUi, []);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [aliases, setAliases] = useState<AliasInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(savedUi.name ?? null);
  const [customName, setCustomName] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [tab, setTab] = useState<SideTab>(savedUi.tab ?? 'output');
  const [panel, setPanel] = useState<string>(savedUi.panel ?? '');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [sandbox, setSandbox] = useState<SandboxResult | null>(null);
  const [lane, setLane] = useState<'node' | 'sandbox' | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const sel = useScriptContent(client, selected);
  const { content, savedContent, params, paramValues, busy, setBusy, err, setErr } = sel;

  const dirty = content !== savedContent;
  const working = busy !== null;
  const current = scripts.find((s) => s.name === selected);
  const kind = current?.kind;

  // 换脚本 = 换上下文：上一次的产出不该留在屏幕上（会让人以为是新脚本跑的）
  useEffect(() => {
    setRunResult(null);
    setSandbox(null);
    setLane(null);
  }, [selected]);

  // 刷新后回到原脚本/原 tab/原面板——选择也是 UI 状态，不能每次跳回第一个
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ name: selected, tab, panel }));
    } catch {
      /* 隐私模式等场景静默降级 */
    }
  }, [selected, tab, panel]);

  const loadScripts = useCallback(
    async (prefer?: string) => {
      const r = await client['script.list']({});
      setScripts(r.scripts);
      setSelected((prev) => {
        const want = prefer ?? prev;
        return want && r.scripts.some((s) => s.name === want) ? want : (r.scripts[0]?.name ?? null);
      });
      return r.scripts;
    },
    [client],
  );

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const r = await client['script.runs']({ limit: 30 });
      setRuns(r.runs);
    } catch {
      // 台账读不到不该打断工作——它是辅助信息
    } finally {
      setRunsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadScripts().catch((e: unknown) => setErr(String((e as { message?: string })?.message || e)));
  }, [loadScripts, setErr]);

  useEffect(() => {
    client['script.aliases']({})
      .then((r) => setAliases(r.aliases))
      .catch((e: unknown) => setErr(String((e as { message?: string })?.message || e)));
  }, [client, setErr]);

  useEffect(() => {
    if (tab === 'runs') void loadRuns();
  }, [tab, loadRuns]);

  const selectScript = useCallback(
    async (name: string) => {
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
    },
    [selected, dirty, dialog],
  );

  // 保存是两条通道的共同前置：跑的必须是编辑器里那一份
  const ensureSaved = useCallback(async (): Promise<boolean> => {
    if (!selected || !dirty) return true;
    setBusy('save');
    try {
      await client['script.save']({ name: selected, content });
      sel.setSavedContent(content);
      return true;
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [selected, dirty, client, content, toast, sel, setBusy]);

  const save = useCallback(async () => {
    if (!selected || !dirty || working) return;
    if (await ensureSaved()) toast(`已保存 ${selected}.mjs`);
  }, [selected, dirty, working, ensureSaved, toast]);

  const argv = useCallback(
    () => [...paramTokens(params, paramValues), ...customArgTokens(customName, customValue)],
    [params, paramValues, customName, customValue],
  );

  const run = useCallback(async () => {
    if (!selected || working) return;
    setTab('output');
    setErr('');
    if (!(await ensureSaved())) return;
    setBusy('run');
    try {
      setRunResult(await client['script.run']({ name: selected, args: argv(), panel: panel || undefined }));
      setSandbox(null);
      setLane('node');
    } catch (e) {
      setRunResult({
        script: selected,
        path: '',
        code: 1,
        stdout: '',
        stderr: String((e as { message?: string })?.message || e),
      });
      setLane('node');
    } finally {
      setBusy(null);
    }
  }, [selected, working, ensureSaved, client, panel, argv, setBusy, setErr]);

  const runSandbox = useCallback(async () => {
    if (!selected || working) return;
    setTab('output');
    setErr('');
    if (!(await ensureSaved())) return;
    setBusy('sandbox');
    try {
      setSandbox(
        await client['script.sandbox']({ name: selected, panel: panel || undefined, args: argv() }),
      );
      setRunResult(null);
      setLane('sandbox');
      // 跑完顺手刷台账：切到「台账」时看到的应该包含刚才这次
      void loadRuns();
    } catch (e) {
      toast(String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  }, [selected, working, ensureSaved, client, panel, argv, loadRuns, toast, setBusy, setErr]);

  const create = useCallback(async () => {
    const raw = await dialog({
      title: '新建脚本',
      message: '脚本名（不含 .mjs）；以 .short 结尾表示短脚本（沙箱执行）。',
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
  }, [dialog, client, loadScripts, toast, setBusy]);

  const remove = useCallback(async () => {
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
  }, [selected, dialog, client, toast, loadScripts, setBusy]);

  // Ctrl/Cmd+S 保存；Ctrl/Cmd+Enter 按当前脚本类型跑对应通道
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's') {
        e.preventDefault();
        void save();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (kind === 'short') void runSandbox();
        else if (kind !== 'shared') void run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, run, runSandbox, kind]);

  const aliasGroups = useMemo(() => {
    const m = new Map<string, AliasInfo[]>();
    for (const a of aliases) {
      const list = m.get(a.group) || [];
      list.push(a);
      m.set(a.group, list);
    }
    return [...m.entries()];
  }, [aliases]);

  // 变量堆：只看「最近一次跑的那条通道」——两条混在一起会让人分不清哪来的
  const heap: HeapRow[] = useMemo(() => {
    if (lane === 'sandbox') return sandbox?.heap ?? [];
    if (lane === 'node') return runResult?.heap ?? [];
    return [];
  }, [lane, sandbox, runResult]);

  const grouped = useMemo(() => {
    const m = new Map<ScriptInfo['kind'], ScriptInfo[]>();
    for (const s of scripts) {
      const list = m.get(s.kind) || [];
      list.push(s);
      m.set(s.kind, list);
    }
    return KIND_ORDER.map((k) => [k, m.get(k) ?? []] as const).filter(([, list]) => list.length > 0);
  }, [scripts]);

  const sharedPanels = useMemo(() => scripts.filter((s) => s.kind === 'shared'), [scripts]);

  return {
    dialogNode,
    scripts,
    grouped,
    sharedPanels,
    selected,
    current,
    kind,
    content,
    dirty,
    busy,
    working,
    err,
    params,
    paramValues,
    customName,
    customValue,
    tab,
    panel,
    runResult,
    sandbox,
    heap,
    runs,
    runsLoading,
    aliasGroups,
    setContent: sel.setContent,
    setCustomName,
    setCustomValue,
    setTab,
    setPanel,
    setParamValues: sel.setParamValues,
    selectScript,
    save,
    run,
    runSandbox,
    create,
    remove,
    loadRuns,
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
