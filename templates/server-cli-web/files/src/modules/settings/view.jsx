// 设置页：本机配置的唯一界面。
//
// 目前承载「栏目管理」——分组（把同域页面收拢成一个头部入口）、隐藏（不常用的不占位置）
// 与平铺顺序，全部用**拖拽**编排。页面清单由后端给（core/views.js 是唯一来源），
// 配置存在本机 store 的 settings 里；保存后刷新 store，头部立刻按新配置重排。
//
// 一页一保存：顶部只出现一次「有未保存的改动 / 保存 / 放弃改动」，不按块各存各的。
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../web/frontend/api/client.js';
import { useStore } from '../../web/frontend/store.jsx';
import { useGuard, useToast } from '../../web/frontend/components/ui.jsx';
import * as nav from '../../web/frontend/components/navModel.js';
import NavManager from './navManager.jsx';

// 面板里也把 CLI 等价写法亮出来（agent 与人都能照着敲）
const CLI_HINT = "{{name}} setting set --set 'navGroups=[{\"title\":\"求职\",\"views\":[\"home\"]}]'"
  + ' / --set navHidden=home / --set navOrder=["home","settings"]';

export default function SettingsView() {
  const { settings, refreshSettings } = useStore();
  const toast = useToast();
  const guard = useGuard();

  const [cfg, setCfg] = useState(nav.emptyConfig());
  const [baseline, setBaseline] = useState(nav.emptyConfig());

  const sections = useMemo(
    () => (settings?.views || []).map((v) => ({ id: v.id, title: v.title })),
    [settings],
  );
  const allIds = useMemo(() => sections.map((s) => s.id), [sections]);

  // 后端配置 → 工作副本（编辑都在副本上，放弃即丢弃）
  useEffect(() => {
    if (!settings) return;
    const next = nav.configFromSettings(settings.settings);
    setCfg(next);
    setBaseline(next);
  }, [settings]);

  const problems = useMemo(() => nav.validate(cfg, allIds), [cfg, allIds]);
  const dirty = nav.isDirty(cfg, baseline);

  // useGuard 是「跑一次并兜错」（不是包装器）：直接调用它，失败的 toast 由它统一发
  const save = () => guard(async () => {
    if (problems.length) { toast(`保存失败：${problems[0].message}`); return; }
    await api('/api/settings', { method: 'PATCH', body: { set: nav.configToPayload(cfg) } });
    await refreshSettings();
    toast('设置已保存');
  });

  const discard = () => setCfg(structuredClone(baseline));

  if (!settings) return <div className="muted" style={{ padding: 24 }}>加载中…</div>;

  return (
    <div className="stack">
      <div className="toolbar">
        <strong>设置</strong>
        <span className="muted">本机配置 · 只影响这台机器上的显示与默认行为</span>
        <span className="right rowgap">
          {dirty ? (
            <>
              <span className="tag">有未保存的改动</span>
              <button className="btn small" onClick={() => { void save(); }}>保存</button>
              <button className="btn small ghost" onClick={discard}>放弃改动</button>
            </>
          ) : <span className="muted">已保存</span>}
        </span>
      </div>

      <div className="card">
        <div className="colhead">
          栏目管理
          <span className="right muted">
            头部显示 {allIds.length - cfg.hidden.length} 个 · 隐藏 {cfg.hidden.length} 个
            {cfg.groups.length ? ` · ${cfg.groups.length} 个分组` : ''}
          </span>
        </div>
        <div style={{ padding: 12 }} className="stack">
          <div className="muted">
            拖动就是把结构摆成你要的样子：页面可以拖进分组、组内换位、拖回平铺区即移出；拖分组把手换分组顺序。
            被隐藏的页面只是头部不显示入口，用 <code>#/页面id</code> 直达仍然可用。
          </div>
          <NavManager sections={sections} value={cfg} onChange={setCfg} />
          {problems.map((p) => <div key={p.field} className="bad">· {p.message}</div>)}
        </div>
      </div>

      <div className="muted" style={{ padding: '0 2px' }}>
        {/* 提示文本整段放进 JS 字符串：JSON 里的 {} 若直接写在 JSX 文本里会被当成表达式 */}
        CLI 等价：<code>{CLI_HINT}</code>
      </div>
    </div>
  );
}
