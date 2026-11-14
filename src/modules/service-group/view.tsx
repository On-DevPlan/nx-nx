// 服务工作台（表单版）：服务组列表 / 状态 / 启停 / 表单化配置 / 流水线画布。
//
// 设计原则：用户不碰 JSON。所有配置项都是表单字段（下拉/输入/多选），
// 保存时由前端拼成配置对象提交 sg set；JSON 仅作为只读查看的折叠面板。
//
// 数据获取换成 react-query 的原因：
//   原来是一个 setInterval + 手写 load()，每 5 秒无差别重拉，动作之后还要
//   手工调一次 load；出错只能塞进一个局部 err。react-query 把「缓存 / 轮询 /
//   失效重取 / 加载与错误态」都收进一处：动作成功只需 invalidate，视图自己更新。
//
// 组件库：antd + @tanstack/react-query + @xyflow/react（流水线画布）。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Space, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CliHints } from '../../web/frontend/components/CliHints.js';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { SgForm, configFromForm, emptyForm, formFromConfig, type FormState } from './form.js';
import { StatusCard, type SgAction } from './status-card.js';
import { LogsDrawer } from './logs-drawer.js';
import { SpacePanel } from './space-panel.js';
import { PipelineCanvas } from './pipeline-canvas.js';
import type { GroupView } from './types.js';

const LIST_KEY = ['service-groups'] as const;

export default function ServiceView() {
  const { client, boot } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();
  const qc = useQueryClient();
  const [scripts, setScripts] = useState<{ name: string; shared: boolean }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [showJson, setShowJson] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // 轮询：5 秒一次。页面不可见时 react-query 会自动停掉，不必自己判断。
  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => client['serviceGroup.list']({}),
    refetchInterval: 5000,
    enabled: Boolean(boot),
  });

  const groups: GroupView[] = listQuery.data?.groups ?? [];
  const queryErr = listQuery.error as { message?: string } | null;

  useEffect(() => {
    if (queryErr) setErr(String(queryErr.message || queryErr));
  }, [queryErr]);

  useEffect(() => {
    if (!boot) return;
    client['script.list']({})
      .then((r) => setScripts(r.scripts.map((s) => ({ name: s.name, shared: s.shared }))))
      .catch(() => {});
  }, [client, boot]);

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

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: LIST_KEY });
  }, [qc]);

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
      await refresh();
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
      await refresh();
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
      await refresh();
      // 关闭会改写运行态（含 stopMode 走过的路径），选中态的表单跟着刷一次
      if (selected === id) await select(id);
    } catch (e: unknown) {
      toast('失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  // 自愈开关：唯一入口（表单里只留一句「去哪开」的说明）
  const toggleAutoHeal = async (id: string, on: boolean) => {
    setBusy('autoheal' + id);
    try {
      await client['serviceGroup.autoheal']({ id, state: on ? 'on' : 'off' });
      toast(`自愈已${on ? '开启' : '关闭（仍监控，只记录）'}`);
      await refresh();
      if (selected === id) await select(id);
    } catch (e: unknown) {
      toast('切换失败: ' + String((e as { message?: string })?.message || e));
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
      await refresh();
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

      {/* 右栏：状态 + 流水线 + 空间 + 表单 */}
      <div className="sg-detail">
        {!current ? (
          <Card>
            <Empty description="左侧选择或新建一个服务组。" />
          </Card>
        ) : (
          <>
            {/* 状态卡：活性 / 自愈次数 / 事件 */}
            <StatusCard
              group={current}
              working={working}
              onAction={act}
              onAutoHeal={toggleAutoHeal}
              onShowLogs={() => setLogsOpen(true)}
            />

            {/* 流水线画布：启动 → 探活 → client 步骤，节点颜色跟运行态走 */}
            <Card size="small" title="流水线" extra={<span className="muted">节点颜色 = 当前运行态</span>}>
              <PipelineCanvas group={current} />
            </Card>

            {/* 管理空间：方法清单 + 一键调用（对应「启动按钮对应一段管理空间」）*/}
            <SpacePanel groupId={selected} />

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
      <LogsDrawer groupId={selected} open={logsOpen} onClose={() => setLogsOpen(false)} />
      {dialogNode}
    </div>
  );
}
