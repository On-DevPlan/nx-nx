// 服务工作台（表单版）：服务组列表 / 状态 / 启停 / 表单化配置。
//
// 设计原则：用户不碰 JSON。所有配置项都是表单字段（下拉/输入/多选），
// 保存时由前端拼成配置对象提交 sg set；JSON 仅作为只读查看的折叠面板。
// 表单体在 form.tsx（单文件行数约束），本文件只管列表、状态与动作。
import { useCallback, useEffect, useState } from 'react';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { SgForm, configFromForm, emptyForm, formFromConfig, type FormState } from './form.js';
import type { GroupView } from './types.js';

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
          {err && <div className="empty bad-text">{err}</div>}
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
              <SgForm form={form} set={set} toggleClient={toggleClient} entryScripts={entryScripts} panelScripts={panelScripts} />
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
