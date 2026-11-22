// 服务设置页：把配置、流水线、管理空间、模板创建从服务工作台里拆出来。
//
// 为什么拆：日常运维只需要「探活 / 启动 / 停止 / 看日志」；
// 主脚本、活性参数、停止策略、共享面板、client 顺序都是「配置一次」的东西。
// 两者混在一页会让第一次上手的人以为每个字段都要先填。
//
// 本页只做配置；运行态动作留在 view.tsx（服务首页），避免同一动作两处入口。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Space, Tabs, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { SgForm, configFromForm, emptyForm, formFromConfig, type FormState } from './form.js';
import { StepsField } from './form-steps.js';
import { LaunchEntriesField } from './launch-entries-field.js';
import { PipelineCanvas } from './pipeline-canvas.js';
import { SpacePanel } from './space-panel.js';
import { CreateGroupModal, type CreateInput } from './create-modal.js';
import type { ServiceTemplateMeta } from '../../core/service/templates.js';
import type { GroupView } from './types.js';

const LIST_KEY = ['service-groups'] as const;

export default function ServiceSettingsView() {
  const { client, boot, ui, patchUi } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();
  const qc = useQueryClient();
  const [scripts, setScripts] = useState<
    { name: string; shared: boolean; kind: 'long' | 'short' | 'shared'; source: 'group' | 'external' }[]
  >([]);
  const [selected, setSelected] = useState<string | null>(ui.serviceId || null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createTemplate, setCreateTemplate] = useState<string | undefined>(undefined);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientCode, setClientCode] = useState('');

  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => client['serviceGroup.list']({}),
    refetchInterval: 5000,
    enabled: Boolean(boot),
  });
  const templatesQuery = useQuery({
    queryKey: ['service-templates'],
    queryFn: () => client['serviceGroup.templates']({}),
    enabled: Boolean(boot),
  });
  const templates: ServiceTemplateMeta[] = useMemo(
    () => templatesQuery.data?.templates ?? [],
    [templatesQuery.data],
  );
  const groups: GroupView[] = listQuery.data?.groups ?? [];
  const current = groups.find((g) => g.config.id === selected) ?? null;

  const select = useCallback(
    async (id: string) => {
      setSelected(id);
      patchUi({ serviceId: id });
      try {
        const r = await client['serviceGroup.show']({ id });
        setForm(formFromConfig(r.config));
        setScripts((r.scripts ?? []).map((s) => ({ name: s.name, shared: s.shared, kind: s.kind, source: s.source })));
      } catch (e: unknown) {
        setErr(String((e as { message?: string })?.message || e));
      }
    },
    [client, patchUi],
  );

  // 从服务首页跳进来时，selected 来自 localStorage；列表就绪后补拉一次配置。
  useEffect(() => {
    if (selected && groups.some((g) => g.config.id === selected) && !form.name) {
      void select(selected);
    }
  }, [selected, groups, form.name, select]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: LIST_KEY });
  }, [qc]);

  const openCreate = (templateId?: string) => {
    setCreateTemplate(templateId);
    setCreateOpen(true);
  };

  // 新建 client 的默认值：名字带服务前缀、内容是一个能跑的请求样例。
  // 脚本正文落当前组的命名空间（与全局脚本模块隔离），运行时 cwd 是该服务自己的目录。
  const openClient = () => {
    if (!selected) return;
    let n = `${selected}-client`;
    let i = 2;
    while (scripts.some((s) => s.name === n)) n = `${selected}-client-${i++}`;
    const port = current?.config.health?.port ?? 18080;
    setClientName(n);
    setClientCode(
      [
        `// ${n} —— ${selected} 的 client 脚本（请求 / 验证 / 构建都放这里）。`,
        '// 运行目录就是服务 cwd：process.env.NX_SERVICE_DIR。',
        `const BASE_URL = 'http://127.0.0.1:${port}';`,
        '',
        `const res = await fetch(BASE_URL + '/ping');`,
        `log('${n}: HTTP ' + res.status);`,
        `if (!res.ok) throw new Error('请求失败: ' + res.status);`,
        '',
      ].join('\n'),
    );
    setClientOpen(true);
  };

  const createClient = async () => {
    if (!selected) return;
    const name = clientName.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      toast('脚本名只能用字母 / 数字 / . _ -，且不能以符号开头');
      return;
    }
    setBusy('client');
    try {
      await client['serviceGroup.script']({
        id: selected,
        op: 'create',
        name,
        content: clientCode,
      });
      const view = await client['serviceGroup.show']({ id: selected });
      setScripts((view.scripts ?? []).map((s) => ({ name: s.name, shared: s.shared, kind: s.kind, source: s.source })));
      setForm((prev) => ({
        ...prev,
        clients: prev.clients.includes(name) ? prev.clients : [...prev.clients, name],
      }));
      setClientOpen(false);
      toast(`已在服务命名空间创建并加入流水线：${name}（点「保存配置」后生效）`);
    } catch (e: unknown) {
      toast('新建 client 失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const doCreate = async (input: CreateInput) => {
    setBusy('create');
    try {
      if (input.template === '__blank') {
        await client['serviceGroup.set']({
          id: input.id,
          config: JSON.stringify({ name: input.id, stopMode: 'auto', clients: [] }),
        });
        toast(`已创建空白服务组 ${input.id}`);
      } else {
        const r = await client['serviceGroup.init']({
          id: input.id,
          template: input.template,
          port: input.port,
          name: input.name,
        });
        toast(
          `已按模板 ${input.template} 创建 ${input.id}（新建 ${r.written.length} 个脚本` +
            (r.skipped.length ? `，复用 ${r.skipped.length} 个已有脚本` : '') +
            '）',
        );
      }
      setCreateOpen(false);
      await refresh();
      await select(input.id);
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
      patchUi({ serviceId: '' });
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

  const entryScripts = scripts.filter((s) => !s.shared && s.kind === 'long');
  const panelScripts = scripts.filter((s) => s.shared);
  const working = busy !== null;

  return (
    <div className="sg-grid">
      <Card
        className="sg-list"
        size="small"
        title="服务设置"
        extra={
          <Space size={4}>
            <Tooltip title="新建服务组（可选模板）">
              <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate()} disabled={working} />
            </Tooltip>
            <Tooltip title="回到服务首页（三个运行按钮 + 日志）">
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => patchUi({ view: 'services' })} />
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
            <div className="tpl-desc muted">{g.config.name}</div>
          </button>
        ))}
        {!groups.length && (
          <div className="sg-list-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务组" style={{ margin: '16px 0 8px' }} />
            <Button type="primary" block onClick={() => openCreate()} disabled={working}>
              从模板创建（{templates[0]?.exampleId ?? 'ping-demo'}）
            </Button>
          </div>
        )}
        {err && <Alert type="error" message={err} showIcon style={{ margin: 12 }} />}
      </Card>

      <div className="sg-detail">
        {!current ? (
          <Card size="small" title="选择服务组">
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              左侧选一个服务组改配置；或者先按模板创建一个能跑的案例。
            </Typography.Paragraph>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()} disabled={working}>
              从模板创建
            </Button>
          </Card>
        ) : (
          <>
            <Card
              size="small"
              title={<span>服务 · <Typography.Text code>{current.config.id}</Typography.Text></span>}
              extra={
                <Space size={4}>
                  <Tooltip title="删除服务组（会先停止其服务）">
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={working} onClick={removeGroup} />
                  </Tooltip>
                  <Button size="small" type="primary" icon={<SaveOutlined />} disabled={working} onClick={save}>
                    保存配置
                  </Button>
                </Space>
              }
            >
              <Tabs
                size="small"
                defaultActiveKey="basic"
                items={[
                  {
                    key: 'basic',
                    label: '基础配置',
                    children: (
                      <>
                        <SgForm
                          form={form}
                          set={set}
                          entryScripts={entryScripts}
                          panelScripts={panelScripts}
                        />
                        <LaunchEntriesField
                          entries={form.launchEntries}
                          entryScripts={entryScripts}
                          setEntries={(next) => set('launchEntries', next)}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'pipeline',
                    label: '流水线',
                    children: (
                      <>
                        <StepsField
                          clients={form.clients}
                          entryScripts={entryScripts}
                          setClients={(next) => set('clients', next)}
                          toggleClient={toggleClient}
                          onCreateClient={openClient}
                        />
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
                          执行流向（启动 → 探活 → 测试步骤）
                        </Typography.Paragraph>
                        <PipelineCanvas group={current} />
                      </>
                    ),
                  },
                  {
                    key: 'space',
                    label: '共享空间',
                    children: (
                      <>
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                          共享面板 = 常量 + 函数 + 隐藏测试；脚本执行前自动装载，产出以变量堆返回。
                        </Typography.Paragraph>
                        <SpacePanel groupId={selected} />
                      </>
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </div>

      <Modal
        title="新建 client 脚本"
        open={clientOpen}
        okText="创建并加入流水线"
        cancelText="取消"
        confirmLoading={busy === 'client'}
        onOk={() => void createClient()}
        onCancel={() => setClientOpen(false)}
        width={720}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            脚本只写进当前服务组的命名空间（<Typography.Text code>~/.nx-nx/services/groups/{selected}/scripts</Typography.Text>），与全局脚本模块完全隔离；运行时 cwd 仍是服务自己的目录（<Typography.Text code>NX_SERVICE_DIR</Typography.Text>）。
          </Typography.Text>
          <Input
            addonBefore="脚本名"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="mono"
          />
          <Input.TextArea
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value)}
            className="mono"
            autoSize={{ minRows: 10, maxRows: 18 }}
          />
        </Space>
      </Modal>

      <CreateGroupModal
        open={createOpen}
        templates={templates}
        initialTemplate={createTemplate}
        working={working}
        onCancel={() => setCreateOpen(false)}
        onCreate={doCreate}
      />
      {dialogNode}
    </div>
  );
}
