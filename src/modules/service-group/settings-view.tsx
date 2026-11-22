// 服务设置：服务自己的脚本、client 流水线、共享数据、少量高级配置。
// 模板创建即得到完整默认；这里只提供修改，不让用户从空字段开始。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Space, Tabs, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDialog, useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { SgForm, configFromForm, emptyForm, formFromConfig, type FormState } from './form.js';
import { StepsField } from './form-steps.js';
import { LaunchEntriesField } from './launch-entries-field.js';
import { ServiceScriptEditor } from './service-script-editor.js';
import { SpacePanel } from './space-panel.js';
import { CreateGroupModal, type CreateInput } from './create-modal.js';
import type { ServiceTemplateMeta } from '../../core/service/templates.js';
import type { GroupView } from './types.js';

const LIST_KEY = ['service-groups'] as const;
type ScriptInfo = { name: string; shared: boolean; kind: 'long' | 'short' | 'shared'; source: 'group' | 'external' };

export default function ServiceSettingsView() {
  const { client, boot, ui, patchUi } = useStore();
  const toast = useToast();
  const { dialog, node: dialogNode } = useDialog();
  const qc = useQueryClient();
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
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
  const templates: ServiceTemplateMeta[] = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data]);
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

  useEffect(() => {
    if (selected && groups.some((g) => g.config.id === selected) && !form.name) void select(selected);
  }, [selected, groups, form.name, select]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: LIST_KEY });
  }, [qc]);

  const openCreate = (templateId?: string) => {
    setCreateTemplate(templateId);
    setCreateOpen(true);
  };

  const lifecycleScripts = new Set(
    [current?.config.main?.script, current?.config.stop?.script, current?.config.probe?.script].filter(
      (x): x is string => Boolean(x),
    ),
  );
  const clientScripts = scripts.filter((s) => !s.shared && !lifecycleScripts.has(s.name));

  const openClient = () => {
    if (!selected) return;
    let n = `${selected}-client`;
    let i = 2;
    while (scripts.some((s) => s.name === n)) n = `${selected}-client-${i++}`;
    const port = current?.runtime.port ?? current?.config.health?.port ?? 18080;
    const path = current?.config.health?.path ?? '/ping';
    setClientName(n);
    setClientCode(
      [
        `// ${n} —— 当前服务的 client 请求脚本。`,
        `const res = await fetch('http://127.0.0.1:${port}${path}');`,
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
      await client['serviceGroup.script']({ id: selected, op: 'create', name, content: clientCode });
      const view = await client['serviceGroup.show']({ id: selected });
      setScripts((view.scripts ?? []).map((s) => ({ name: s.name, shared: s.shared, kind: s.kind, source: s.source })));
      setForm((prev) => ({ ...prev, clients: prev.clients.includes(name) ? prev.clients : [...prev.clients, name] }));
      setClientOpen(false);
      toast(`已创建 ${name}（保存配置后加入流水线）`);
    } catch (e: unknown) {
      toast('新建 client 失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const doCreate = async (input: CreateInput) => {
    setBusy('create');
    try {
      const r = await client['serviceGroup.init']({
        id: input.id,
        template: input.template,
        port: input.port,
        name: input.name,
      });
      toast(`已创建 ${input.id}（${r.written.length} 个默认脚本）`);
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
      title: '删除服务',
      message: `删除服务 ${selected}（会先停止）？此操作不可撤销。`,
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
  const working = busy !== null;
  const panelScripts = scripts.filter((s) => s.shared);

  return (
    <div className="sg-grid">
      <Card className="sg-list" size="small" title="服务设置" extra={
        <Space size={4}>
          <Tooltip title="新建服务（默认完整案例）"><Button size="small" icon={<PlusOutlined />} onClick={() => openCreate()} disabled={working} /></Tooltip>
          <Tooltip title="回到服务首页"><Button size="small" icon={<ArrowLeftOutlined />} onClick={() => patchUi({ view: 'services' })} /></Tooltip>
        </Space>
      } styles={{ body: { padding: 0, overflow: 'auto', flex: 1, minHeight: 0 } }}>
        {groups.map((g) => (
          <button key={g.config.id} className={'tpl-item' + (g.config.id === selected ? ' active' : '')} onClick={() => void select(g.config.id)}>
            <div className="tpl-name mono"><span className="dot" /> {g.config.id}</div>
            <div className="tpl-desc muted">{g.config.name}</div>
          </button>
        ))}
        {!groups.length && (
          <div className="sg-list-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务" style={{ margin: '16px 0 8px' }} />
            <Button type="primary" block onClick={() => openCreate()} disabled={working}>创建完整案例</Button>
          </div>
        )}
        {err && <Alert type="error" message={err} showIcon style={{ margin: 12 }} />}
      </Card>

      <div className="sg-detail">
        {!current ? (
          <Card size="small" title="选择服务">
            <Typography.Paragraph type="secondary">选一个服务修改；或按模板创建自带脚本的完整案例。</Typography.Paragraph>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()} disabled={working}>创建服务</Button>
          </Card>
        ) : (
          <Card size="small" title={<span>服务 · <Typography.Text code>{current.config.id}</Typography.Text></span>} extra={
            <Space size={4}>
              <Tooltip title="删除服务（会先停止）"><Button size="small" danger icon={<DeleteOutlined />} disabled={working} onClick={removeGroup} /></Tooltip>
              <Button size="small" type="primary" icon={<SaveOutlined />} disabled={working} onClick={save}>保存配置</Button>
            </Space>
          }>
            <Tabs key={selected} size="small" defaultActiveKey="scripts" items={[
              {
                key: 'scripts',
                label: '服务脚本',
                children: <ServiceScriptEditor groupId={current.config.id} config={current.config} scripts={scripts} />,
              },
              {
                key: 'clients',
                label: '客户端',
                children: (
                  <>
                    <StepsField
                      clients={form.clients}
                      entryScripts={clientScripts}
                      setClients={(next) => set('clients', next)}
                      toggleClient={toggleClient}
                      onCreateClient={openClient}
                    />
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                      流水线只按顺序执行这些 client；服务的启动、探活、停止在首页操作。
                    </Typography.Paragraph>
                  </>
                ),
              },
              {
                key: 'space',
                label: '共享数据',
                children: (
                  <>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                      示例用户、token 与请求配置已随服务创建；启动后的服务和 client 都读这份数据。
                    </Typography.Paragraph>
                    <SpacePanel groupId={selected} />
                  </>
                ),
              },
              {
                key: 'advanced',
                label: '高级',
                children: (
                  <>
                    <SgForm form={form} set={set} entryScripts={scripts.filter((s) => !s.shared)} panelScripts={panelScripts} />
                    <LaunchEntriesField entries={form.launchEntries} entryScripts={scripts.filter((s) => !s.shared)} setEntries={(next) => set('launchEntries', next)} />
                  </>
                ),
              },
            ]} />
          </Card>
        )}
      </div>

      <Modal title="新建 client" open={clientOpen} okText="创建" cancelText="取消" confirmLoading={busy === 'client'} onOk={() => void createClient()} onCancel={() => setClientOpen(false)} width={680}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">写入当前服务命名空间，运行时目录为服务自己的 cwd。</Typography.Text>
          <Input addonBefore="脚本名" value={clientName} onChange={(e) => setClientName(e.target.value)} className="mono" />
          <Input.TextArea value={clientCode} onChange={(e) => setClientCode(e.target.value)} className="mono" autoSize={{ minRows: 9, maxRows: 16 }} />
        </Space>
      </Modal>
      <CreateGroupModal open={createOpen} templates={templates} initialTemplate={createTemplate} working={working} onCancel={() => setCreateOpen(false)} onCreate={doCreate} />
      {dialogNode}
    </div>
  );
}
