// 服务工作台（表单版）：服务组列表 / 状态 / 启停 / 表单化配置。
//
// 设计原则：用户不碰 JSON。所有配置项都是表单字段（下拉/输入/多选），
// 保存时由前端拼成配置对象提交 sg set；JSON 仅作为只读查看的折叠面板。
// 表单体在 form.tsx（单文件行数约束），本文件只管列表、状态与动作。
//
// 组件库：antd（见 components/theme.tsx 的 token 对齐）——
// 状态卡用 Badge/Statistic/Tooltip，配置区用 Form 家族，
// 流水线步骤用可排序列表（顺序 = 执行顺序）。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Space, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { SgForm, configFromForm, emptyForm, formFromConfig, type FormState } from './form.js';
import { StatusCard, type SgAction } from './status-card.js';
import type { GroupView } from './types.js';

export default function ServiceView() {
  const { client } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();
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
    const raw = await dialog({
      title: '新建服务组',
      message: '服务组 id（小写字母/数字/连字符，如 my-svc）。创建后可在右侧配置主脚本与活性检测。',
      input: true,
      placeholder: 'my-svc',
    });
    if (typeof raw !== 'string') return;
    const id = raw.trim();
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

  const act = async (action: SgAction, id: string) => {
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
    const ok = await dialog({
      title: '删除服务组',
      message: `删除服务组 ${selected}（会先停止其服务）？此操作不可撤销。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
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
  const working = busy !== null;

  return (
    <div className="sg-grid">
      {/* 左栏：服务组列表 */}
      <Card
        className="sg-list"
        size="small"
        title="服务组"
        extra={
          <Space size={4}>
            <Badge count={groups.length} showZero color="#8b9096" />
            <Tooltip title="新建服务组">
              <Button size="small" icon={<PlusOutlined />} onClick={createGroup} disabled={working} />
            </Tooltip>
          </Space>
        }
        styles={{ body: { padding: 0, overflow: 'auto', flex: 1, minHeight: 0 } }}
      >
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
        {!groups.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务组" style={{ margin: '24px 0' }} />}
        {err && <Alert type="error" message={err} showIcon style={{ margin: 12 }} />}
        <CliHints module="service-group" />
      </Card>

      {/* 右栏：状态 + 表单 */}
      <div className="sg-detail">
        {!current ? (
          <Card>
            <Empty description="左侧选择或新建一个服务组。" />
          </Card>
        ) : (
          <>
            {/* 状态卡：活性 / 自愈次数 / 事件 */}
            <StatusCard group={current} working={working} onAction={act} />

            {/* 配置表单 */}
            <Card
              size="small"
              title="配置"
              extra={
                <Space size={4}>
                  <Tooltip title="删除服务组（会先停止其服务）">
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={working} onClick={removeGroup} />
                  </Tooltip>
                  <Button size="small" type="primary" icon={<EditOutlined />} disabled={working} onClick={save}>
                    保存配置
                  </Button>
                </Space>
              }
            >
              <SgForm form={form} set={set} toggleClient={toggleClient} entryScripts={entryScripts} panelScripts={panelScripts} />
              <Button size="small" type="link" style={{ paddingLeft: 0 }} onClick={() => setShowJson((v) => !v)}>
                {showJson ? '收起 JSON' : '查看 JSON'}
              </Button>
              {showJson && (
                <pre className="mono sg-json-pre">{JSON.stringify(configFromForm(current.config.id, form), null, 2)}</pre>
              )}
            </Card>
          </>
        )}
      </div>
      {dialogNode}
    </div>
  );
}
