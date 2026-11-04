// 服务工作台（表单版）：服务组列表 / 状态 / 启停 / 表单化配置。
//
// 设计原则：用户不碰 JSON。所有配置项都是表单字段（下拉/输入/多选），
// 保存时由前端拼成配置对象提交 sg set；JSON 仅作为只读查看的折叠面板。
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
    health?: {
      kind: 'port' | 'http';
      port: number;
      host: string;
      path: string;
      intervalMs: number;
      failThreshold: number;
      onDead: 'restart' | 'none';
    };
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

interface FormState {
  name: string;
  mainScript: string;
  mainArgs: string;
  stopScript: string;
  killPort: string;
  healthEnabled: boolean;
  healthKind: 'port' | 'http';
  healthHost: string;
  healthPort: string;
  healthPath: string;
  healthIntervalMs: string;
  healthFailThreshold: string;
  onDead: 'restart' | 'none';
  shared: string;
  clients: string[];
}

function emptyForm(): FormState {
  return {
    name: '',
    mainScript: '',
    mainArgs: '',
    stopScript: '',
    killPort: '',
    healthEnabled: false,
    healthKind: 'port',
    healthHost: '127.0.0.1',
    healthPort: '',
    healthPath: '/health',
    healthIntervalMs: '5000',
    healthFailThreshold: '3',
    onDead: 'restart',
    shared: '',
    clients: [],
  };
}

function formFromConfig(c: GroupView['config']): FormState {
  return {
    name: c.name,
    mainScript: c.main?.script ?? '',
    mainArgs: (c.main?.args ?? []).join(' '),
    stopScript: c.stop?.script ?? '',
    killPort: c.killPort ? String(c.killPort) : '',
    healthEnabled: !!c.health,
    healthKind: c.health?.kind ?? 'port',
    healthHost: c.health?.host ?? '127.0.0.1',
    healthPort: c.health ? String(c.health.port) : '',
    healthPath: c.health?.path ?? '/health',
    healthIntervalMs: String(c.health?.intervalMs ?? 5000),
    healthFailThreshold: String(c.health?.failThreshold ?? 3),
    onDead: c.health?.onDead ?? 'restart',
    shared: c.shared ?? '',
    clients: [...c.clients],
  };
}

function configFromForm(id: string, f: FormState): Record<string, unknown> {
  const num = (s: string) => (s.trim() ? Number(s.trim()) : undefined);
  return {
    name: f.name || id,
    main: f.mainScript ? { script: f.mainScript, args: f.mainArgs.split(/\s+/).filter(Boolean) } : undefined,
    stop: f.stopScript ? { script: f.stopScript, args: [] } : undefined,
    killPort: num(f.killPort),
    health: f.healthEnabled
      ? {
          kind: f.healthKind,
          host: f.healthHost || '127.0.0.1',
          port: num(f.healthPort),
          path: f.healthPath || '/health',
          intervalMs: Number(f.healthIntervalMs) || 5000,
          failThreshold: Number(f.healthFailThreshold) || 3,
          onDead: f.onDead,
        }
      : undefined,
    shared: f.shared || undefined,
    clients: f.clients,
  };
}

export default function ServiceView() {
  const { client } = useStore();
  const toast = useToast();
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [scripts, setScripts] = useState<{ name: string; shared: boolean }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [showJson, setShowJson] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await client['serviceGroup.list']({});
      setGroups(r.groups);
      setErr('');
    } catch (e: unknown) {
      setErr(String((e as { message?: string })?.message || e));
    }
  }, [client]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    client['script.list']({})
      .then((r) => setScripts(r.scripts.map((s) => ({ name: s.name, shared: s.shared }))))
      .catch(() => {});
  }, [client]);

  const current = groups.find((g) => g.config.id === selected) ?? null;

  const select = useCallback(
    async (id: string) => {
      setSelected(id);
      try {
        const r = await client['serviceGroup.show']({ id });
        setForm(formFromConfig(r.config));
      } catch (e: unknown) {
        setErr(String((e as { message?: string })?.message || e));
      }
    },
    [client],
  );

  const createGroup = async () => {
    const id = prompt('新服务组 id（小写字母/数字/连字符，如 my-svc）：');
    if (!id) return;
    setBusy('create');
    try {
      await client['serviceGroup.set']({ id, config: JSON.stringify({ name: id, clients: [] }) });
      await load();
      await select(id);
      toast(`已创建 ${id}`);
    } catch (e: unknown) {
      toast('创建失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy('save');
    try {
      await client['serviceGroup.set']({ id: selected, config: JSON.stringify(configFromForm(selected, form)) });
      toast('已保存');
      await load();
    } catch (e: unknown) {
      toast('保存失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: 'serviceGroup.start' | 'serviceGroup.stop' | 'serviceGroup.check' | 'serviceGroup.run', id: string) => {
    setBusy(action + id);
    try {
      const r = await client[action]({ id });
      toast(String(JSON.stringify(r).slice(0, 220)));
      await load();
    } catch (e: unknown) {
      toast('失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const removeGroup = async () => {
    if (!selected) return;
    if (!confirm(`删除服务组 ${selected}（会先停止其服务）？`)) return;
    setBusy('delete');
    try {
      await client['serviceGroup.delete']({ id: selected });
      setSelected(null);
      setForm(emptyForm());
      await load();
      toast('已删除');
    } catch (e: unknown) {
      toast('删除失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleClient = (name: string) =>
    setForm((prev) => ({
      ...prev,
      clients: prev.clients.includes(name) ? prev.clients.filter((c) => c !== name) : [...prev.clients, name],
    }));

  const entryScripts = scripts.filter((s) => !s.shared);
  const panelScripts = scripts.filter((s) => s.shared);

  return (
    <div className="sg-grid">
      {/* 左栏：服务组列表 */}
      <div className="card sg-list">
        <div className="colhead">
          <span>服务组</span>
          <span className="acts">
            <span className="tag">{groups.length}</span>
            <button className="btn small" onClick={createGroup} disabled={busy !== null}>
              新建
            </button>
          </span>
        </div>
        <div className="sg-list-body">
          {groups.map((g) => (
            <button
              key={g.config.id}
              className={'tpl-item' + (g.config.id === selected ? ' active' : '')}
              onClick={() => void select(g.config.id)}
            >
              <div className="tpl-name mono">
                {g.runtime.status === 'running' ? (
                  <span className={g.runtime.alive === false ? 'dot dot-bad' : 'dot dot-ok'} />
                ) : (
                  <span className="dot" />
                )}{' '}
                {g.config.id}
              </div>
              <div className="tpl-desc muted">
                {g.config.name}
                {g.runtime.restarts > 0 ? ` · 自愈 ${g.runtime.restarts} 次` : ''}
              </div>
            </button>
          ))}
          {!groups.length && <div className="empty">暂无服务组，点「新建」开始。</div>}
        </div>
        <CliHints module="service-group" />
      </div>

      {/* 右栏：状态 + 表单 */}
      <div className="sg-detail">
        {!current ? (
          <div className="empty">左侧选择或新建一个服务组。</div>
        ) : (
          <>
            {/* 状态卡 */}
            <div className="card sg-status">
              <div className="colhead">
                <span className="mono">{current.config.id}</span>
                <span className="acts">
                  <button className="btn small" disabled={busy !== null} onClick={() => void act('serviceGroup.start', current.config.id)}>启动</button>
                  <button className="btn small" disabled={busy !== null} onClick={() => void act('serviceGroup.stop', current.config.id)}>停止</button>
                  <button className="btn small" disabled={busy !== null} onClick={() => void act('serviceGroup.check', current.config.id)}>活性检测</button>
                  <button className="btn small" disabled={busy !== null} onClick={() => void act('serviceGroup.run', current.config.id)}>跑流水线</button>
                </span>
              </div>
              <div className="sg-status-body">
                <span className="sg-pill">{current.runtime.status}{current.runtime.pid ? ` · pid ${current.runtime.pid}` : ''}</span>
                {current.runtime.alive !== undefined && (
                  <span className={current.runtime.alive ? 'sg-pill ok' : 'sg-pill bad'}>
                    {current.runtime.alive ? '活性 OK' : '活性 FAIL'}
                  </span>
                )}
                {current.runtime.restarts > 0 && <span className="sg-pill">自愈 {current.runtime.restarts} 次</span>}
                {current.runtime.detail && <span className="muted">{current.runtime.detail}</span>}
              </div>
              {current.runtime.lastEvent && <div className="muted small-line">最近事件: {current.runtime.lastEvent}</div>}
              {current.runtime.logFile && <div className="muted small-line mono">日志: {current.runtime.logFile}</div>}
            </div>

            {/* 配置表单 */}
            <div className="card sg-form">
              <div className="colhead">
                <span>配置</span>
                <span className="acts">
                  <button className="btn small danger" disabled={busy !== null} onClick={removeGroup}>删除组</button>
                  <button className="btn small" disabled={busy !== null} onClick={save}>保存配置</button>
                </span>
              </div>

              <div className="sg-form-body">
                <label className="sg-row">
                  <span>显示名</span>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="我的服务" />
                </label>

                <div className="sg-section">主脚本（长驻服务，IO 重定向到日志）</div>
                <label className="sg-row">
                  <span>主脚本</span>
                  <select value={form.mainScript} onChange={(e) => set('mainScript', e.target.value)}>
                    <option value="">（不配置）</option>
                    {entryScripts.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-row">
                  <span>启动参数</span>
                  <input value={form.mainArgs} onChange={(e) => set('mainArgs', e.target.value)} placeholder="--port 18999（空格分隔）" />
                </label>

                <div className="sg-section">活性检测（连续失败达阈值后处理）</div>
                <label className="sg-row">
                  <span>启用检测</span>
                  <input type="checkbox" checked={form.healthEnabled} onChange={(e) => set('healthEnabled', e.target.checked)} />
                </label>
                {form.healthEnabled && (
                  <>
                    <label className="sg-row">
                      <span>检测方式</span>
                      <select value={form.healthKind} onChange={(e) => set('healthKind', e.target.value as 'port' | 'http')}>
                        <option value="port">端口可连</option>
                        <option value="http">HTTP 响应</option>
                      </select>
                    </label>
                    <label className="sg-row">
                      <span>主机</span>
                      <input value={form.healthHost} onChange={(e) => set('healthHost', e.target.value)} placeholder="127.0.0.1" />
                    </label>
                    <label className="sg-row">
                      <span>端口</span>
                      <input value={form.healthPort} onChange={(e) => set('healthPort', e.target.value)} placeholder="18999" />
                    </label>
                    {form.healthKind === 'http' && (
                      <label className="sg-row">
                        <span>路径</span>
                        <input value={form.healthPath} onChange={(e) => set('healthPath', e.target.value)} placeholder="/health" />
                      </label>
                    )}
                    <label className="sg-row">
                      <span>间隔（ms）</span>
                      <input value={form.healthIntervalMs} onChange={(e) => set('healthIntervalMs', e.target.value)} placeholder="5000" />
                    </label>
                    <label className="sg-row">
                      <span>失败阈值</span>
                      <input value={form.healthFailThreshold} onChange={(e) => set('healthFailThreshold', e.target.value)} placeholder="3" />
                    </label>
                    <label className="sg-row">
                      <span>失活处理</span>
                      <select value={form.onDead} onChange={(e) => set('onDead', e.target.value as 'restart' | 'none')}>
                        <option value="restart">自愈重启</option>
                        <option value="none">仅记录</option>
                      </select>
                    </label>
                  </>
                )}

                <div className="sg-section">停止策略</div>
                <label className="sg-row">
                  <span>关停脚本</span>
                  <select value={form.stopScript} onChange={(e) => set('stopScript', e.target.value)}>
                    <option value="">（无）</option>
                    {entryScripts.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-row">
                  <span>兜底杀端口</span>
                  <input value={form.killPort} onChange={(e) => set('killPort', e.target.value)} placeholder="如 18999（留空不启用）" />
                </label>

                <div className="sg-section">关联脚本</div>
                <label className="sg-row">
                  <span>共享面板</span>
                  <select value={form.shared} onChange={(e) => set('shared', e.target.value)}>
                    <option value="">（无）</option>
                    {panelScripts.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <div className="sg-row">
                  <span>client 脚本</span>
                  <div className="sg-clients">
                    {entryScripts.map((s) => (
                      <label key={s.name} className="sg-client">
                        <input type="checkbox" checked={form.clients.includes(s.name)} onChange={() => toggleClient(s.name)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sg-json">
                <button className="btn small" onClick={() => setShowJson((v) => !v)}>
                  {showJson ? '收起 JSON' : '查看 JSON'}
                </button>
                {showJson && (
                  <pre className="mono">{JSON.stringify(configFromForm(current.config.id, form), null, 2)}</pre>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
