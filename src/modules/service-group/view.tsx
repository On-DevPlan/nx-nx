// 服务工作台：服务组列表 / 启停 / 活性 / 流水线。
//
// 设计取舍（MVP）：
//   - 配置编辑走 JSON 文本域（sg set 的等价物），字段太杂先不做表单
//   - 列表 5 秒轮询运行态，显示活性与自愈计数
import { useCallback, useEffect, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';

interface GroupView {
  config: {
    id: string;
    name: string;
    main?: { script: string; args: string[] };
    stop?: { script: string; args: string[] };
    killPort?: number;
    health?: unknown;
    shared?: string;
    clients: string[];
  };
  runtime: {
    status: string;
    pid?: number;
    alive?: boolean;
    detail?: string;
    failStreak: number;
    restarts: number;
    lastEvent?: string;
    logFile?: string;
  };
}

export default function ServiceView() {
  const { client } = useStore();
  const toast = useToast();
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await client['serviceGroup.list']({});
      setGroups(r.groups);
      setErr('');
      setSelected((prev) => prev ?? r.groups[0]?.config.id ?? null);
    } catch (e: unknown) {
      setErr(String((e as { message?: string })?.message || e));
    }
  }, [client]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const current = groups.find((g) => g.config.id === selected) ?? null;

  const act = async (action: 'serviceGroup.start' | 'serviceGroup.stop' | 'serviceGroup.check' | 'serviceGroup.run', id: string) => {
    setBusy(action + id);
    try {
      const r = await client[action]({ id });
      toast(String(JSON.stringify(r).slice(0, 200)));
      await load();
    } catch (e: unknown) {
      toast('失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!selected) return;
    try {
      JSON.parse(jsonText); // 先本地校验
    } catch {
      toast('JSON 不合法');
      return;
    }
    setBusy('save');
    try {
      await client['serviceGroup.set']({ id: selected, config: jsonText });
      toast('已保存');
      await load();
    } catch (e: unknown) {
      toast('保存失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const select = async (id: string) => {
    setSelected(id);
    try {
      const r = await client['serviceGroup.show']({ id });
      setJsonText(JSON.stringify(r.config, null, 2));
    } catch (e: unknown) {
      setErr(String((e as { message?: string })?.message || e));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, height: '100%' }}>
      <div style={{ overflow: 'auto', borderRight: '1px solid var(--border, #333)', paddingRight: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>服务组</strong>
          <button onClick={() => void load()}>刷新</button>
        </div>
        {err && <div style={{ color: '#e5484d', fontSize: 12 }}>{err}</div>}
        {groups.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            暂无服务组。CLI：<code>nx-nx sg set &lt;id&gt; --json '{'{"name":"…","main":{"script":"…"}}'}'</code>
          </div>
        )}
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
          {groups.map((g) => (
            <li key={g.config.id}>
              <button
                onClick={() => void select(g.config.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: selected === g.config.id ? 'var(--accent-soft, #2b3b55)' : 'transparent',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <div>
                  <strong>{g.config.id}</strong> <span style={{ opacity: 0.6 }}>{g.config.name}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  [{g.runtime.status}]
                  {g.runtime.status === 'running' &&
                    (g.runtime.alive === false ? ' · 活性 FAIL' : g.runtime.alive === true ? ' · 活性 OK' : '')}
                  {g.runtime.restarts > 0 && ` · 自愈${g.runtime.restarts}次`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ overflow: 'auto' }}>
        {!current ? (
          <div style={{ opacity: 0.6 }}>左侧选择一个服务组，或用 CLI 创建。</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{current.config.name}</strong>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                [{current.runtime.status}]
                {current.runtime.pid ? ` pid ${current.runtime.pid}` : ''}
                {current.runtime.detail ? ` · ${current.runtime.detail}` : ''}
              </span>
              <button disabled={busy !== null} onClick={() => void act('serviceGroup.start', current.config.id)}>启动</button>
              <button disabled={busy !== null} onClick={() => void act('serviceGroup.stop', current.config.id)}>停止</button>
              <button disabled={busy !== null} onClick={() => void act('serviceGroup.check', current.config.id)}>活性检测</button>
              <button disabled={busy !== null} onClick={() => void act('serviceGroup.run', current.config.id)}>跑流水线</button>
              {busy && <span style={{ fontSize: 12, opacity: 0.6 }}>{busy}…</span>}
            </div>
            {current.runtime.lastEvent && (
              <div style={{ fontSize: 12, opacity: 0.75, margin: '6px 0' }}>最近事件: {current.runtime.lastEvent}</div>
            )}
            {current.runtime.logFile && (
              <div style={{ fontSize: 12, opacity: 0.6 }}>日志: {current.runtime.logFile}</div>
            )}

            {/* 组内脚本：都可在「脚本」页编辑（shared 面板可编辑但不可直接运行） */}
            <div style={{ margin: '12px 0 6px' }}>
              <strong style={{ fontSize: 13 }}>组内脚本</strong>
              <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>
                均为 .mjs，在「脚本」页编辑（ctl+s 保存）；共享面板 ⛭ 不可直接运行
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([
                ...(current.config.main ? [{ name: current.config.main.script, role: '主脚本' }] : []),
                ...(current.config.stop ? [{ name: current.config.stop.script, role: '停止' }] : []),
                ...(current.config.shared ? [{ name: current.config.shared, role: '共享面板 ⛭' }] : []),
                ...current.config.clients.map((c) => ({ name: c, role: 'client' })),
              ]).map((s) => (
                <span
                  key={s.name + s.role}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #333)',
                  }}
                >
                  <span style={{ opacity: 0.6 }}>{s.role}:</span> <code>{s.name}</code>
                </span>
              ))}
            </div>
            <div style={{ margin: '12px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
              <strong>配置（JSON）</strong>
              <button disabled={busy !== null} onClick={() => void save()}>保存配置</button>
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', minHeight: 320, fontFamily: 'Consolas, monospace', fontSize: 13 }}
            />
            <CliHints module="service-group" />
          </>
        )}
      </div>
    </div>
  );
}
