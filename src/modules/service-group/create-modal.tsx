// 新建服务：默认就是一个完整案例——启动、停止、探活、共享数据、client 全部就位。
// 创建后可以逐个改，不需要先面对一张空表单。
import { useEffect, useState } from 'react';
import { Input, InputNumber, Modal, Select, Space, Tag, Typography } from 'antd';
import type { ServiceTemplateMeta } from '../../core/service/templates.js';

export interface CreateInput {
  id: string;
  template: string;
  port?: number;
  name?: string;
}

interface Props {
  open: boolean;
  templates: ServiceTemplateMeta[];
  initialTemplate?: string;
  working: boolean;
  onCancel: () => void;
  onCreate: (input: CreateInput) => void;
}

export function CreateGroupModal({ open, templates, initialTemplate, working, onCancel, onCreate }: Props) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? 'node-ping');
  const [id, setId] = useState<string>(templates[0]?.exampleId ?? 'ping-demo');
  const [port, setPort] = useState<number | undefined>(templates[0]?.defaultPort);
  const [name, setName] = useState('');

  const current = templates.find((t) => t.id === templateId) ?? templates[0];

  useEffect(() => {
    if (!open) return;
    const picked = templates.find((t) => t.id === initialTemplate) ?? templates[0];
    setTemplateId(picked?.id ?? 'node-ping');
    setId(picked?.exampleId ?? 'ping-demo');
    setPort(picked?.defaultPort);
    setName('');
  }, [open, templates, initialTemplate]);

  const pickTemplate = (v: string) => {
    const prev = current;
    setTemplateId(v);
    const t = templates.find((x) => x.id === v);
    setPort(t?.defaultPort);
    if (!id || id === prev?.exampleId) setId(t?.exampleId ?? 'ping-demo');
  };

  const invalidId = !/^[a-z][a-z0-9-]{0,31}$/.test(id.trim());

  const submit = () => {
    if (invalidId || !current) return;
    onCreate({ id: id.trim(), template: current.id, port: port ?? current.defaultPort, name: name.trim() || undefined });
  };

  return (
    <Modal
      open={open}
      title="新建服务"
      okText="创建服务"
      cancelText="取消"
      confirmLoading={working}
      onCancel={onCancel}
      onOk={submit}
      okButtonProps={{ disabled: invalidId }}
      width={620}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">自带启动、停止、探活、共享数据和 client，创建后直接改。</Typography.Text>
        <Select
          value={templateId}
          onChange={pickTemplate}
          style={{ width: '100%' }}
          options={templates.map((t) => ({ value: t.id, label: t.title }))}
        />
        {current && (
          <Space size={4} wrap>
            <Tag>{current.level === 'case' ? '完整案例' : '业务案例'}</Tag>
            <Tag color="blue">默认端口 {current.defaultPort}</Tag>
            {current.tags.slice(1).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </Space>
        )}
        <Space size={12} style={{ width: '100%' }} align="start">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ marginBottom: 4 }}>服务 id</div>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="ping-demo" status={invalidId ? 'error' : undefined} />
            {invalidId && <div className="sg-field-err">小写字母开头，仅含小写字母 / 数字 / 连字符</div>}
          </div>
          <div style={{ width: 130 }}>
            <div className="muted" style={{ marginBottom: 4 }}>端口</div>
            <InputNumber value={port} onChange={(v) => setPort(v ?? undefined)} min={1} max={65535} style={{ width: '100%' }} />
          </div>
          <div style={{ width: 160 }}>
            <div className="muted" style={{ marginBottom: 4 }}>显示名</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={current?.defaultName} />
          </div>
        </Space>
      </Space>
    </Modal>
  );
}
