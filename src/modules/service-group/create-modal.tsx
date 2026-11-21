// 新建服务组弹窗：先选模板，再填 id / 端口——默认值直接从模板带出来。
//
// 为什么不是「先建空组再配」：空组的第一步是面对 8 个字段的表单，
// 新手只能猜。模板把「能跑的一组」做成默认答案，创建即完成。
// 空白创建仍保留（路径最短，但要求用户知道自己要什么）。
import { useEffect, useState } from 'react';
import { Alert, Input, InputNumber, Modal, Select, Space, Tag } from 'antd';
import type { ServiceTemplateMeta } from '../../core/service/templates.js';

const BLANK = '__blank';

export interface CreateInput {
  id: string;
  template: string;
  port?: number;
  name?: string;
}

interface Props {
  open: boolean;
  templates: ServiceTemplateMeta[];
  /** 从空态卡片点进来时预选对应模板；不传则用默认（列表第一个） */
  initialTemplate?: string;
  working: boolean;
  onCancel: () => void;
  onCreate: (input: CreateInput) => void;
}

function nextSuggestion(t: ServiceTemplateMeta | undefined): string {
  return t ? t.exampleId : 'my-svc';
}

export function CreateGroupModal({ open, templates, initialTemplate, working, onCancel, onCreate }: Props) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? BLANK);
  const [id, setId] = useState<string>(nextSuggestion(templates[0]));
  const [port, setPort] = useState<number | undefined>(templates[0]?.defaultPort);
  const [name, setName] = useState('');

  const current = templates.find((t) => t.id === templateId);

  // 每次打开都回到「默认模板 + 默认 id + 默认端口」：上一次的输入不该偷偷留下来
  useEffect(() => {
    if (!open) return;
    const picked =
      initialTemplate === BLANK
        ? undefined
        : templates.find((t) => t.id === initialTemplate) ?? templates[0];
    setTemplateId(initialTemplate === BLANK ? BLANK : (picked?.id ?? BLANK));
    setId(nextSuggestion(picked));
    setPort(picked?.defaultPort);
    setName('');
  }, [open, templates, initialTemplate]);

  const pickTemplate = (v: string) => {
    const prev = current;
    setTemplateId(v);
    const t = templates.find((x) => x.id === v);
    setPort(t?.defaultPort);
    // 只有 id 还是「自动建议值」时才跟着模板换；用户手填过就不动
    if (!id || id === nextSuggestion(prev)) setId(nextSuggestion(t));
  };

  const invalidId = !/^[a-z][a-z0-9-]{0,31}$/.test(id.trim());

  const submit = () => {
    if (invalidId) return;
    if (templateId === BLANK) {
      onCreate({ id: id.trim(), template: BLANK });
      return;
    }
    onCreate({ id: id.trim(), template: templateId, port: port ?? current?.defaultPort, name: name.trim() || undefined });
  };

  return (
    <Modal
      open={open}
      title="新建服务组"
      okText={templateId === BLANK ? '创建空白组' : '按模板创建'}
      cancelText="取消"
      confirmLoading={working}
      onCancel={onCancel}
      onOk={submit}
      okButtonProps={{ disabled: invalidId }}
      width={720}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>
            模板会一次生成「脚本 + 配置」，创建完就能启动、探活、关闭。
          </div>
          <Select
            value={templateId}
            onChange={pickTemplate}
            style={{ width: '100%' }}
            options={[
              ...templates.map((t) => ({
                value: t.id,
                label: `${t.title}${t.level === 'case' ? '（推荐起步）' : ''}`,
              })),
              { value: BLANK, label: '空白服务组（自己配脚本与检测）' },
            ]}
          />
        </div>

        {current ? (
          <div className="sg-tpl-preview">
            <div className="muted">{current.summary}</div>
            <Space size={4} wrap style={{ marginTop: 6 }}>
              {current.tags.map((tag) => (
                <Tag key={tag} color="#8b9096">{tag}</Tag>
              ))}
              <Tag color="blue">默认端口 {current.defaultPort}</Tag>
            </Space>
            <pre className="mono sg-tpl-steps">{current.steps.map((s) => s.replaceAll('{id}', id || current.exampleId)).join('\n')}</pre>
          </div>
        ) : (
          <Alert type="info" showIcon message="空白组创建后，到右侧「配置」里选主脚本、开活性检测即可。" />
        )}

        <Space size={12} style={{ width: '100%' }} align="start">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ marginBottom: 4 }}>服务组 id（小写字母/数字/连字符）</div>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ping-demo"
              status={invalidId ? 'error' : undefined}
            />
            {invalidId && <div className="sg-field-err">须为小写字母开头，≤32 位，仅含小写字母/数字/连字符</div>}
          </div>
          {current && (
            <div style={{ width: 140 }}>
              <div className="muted" style={{ marginBottom: 4 }}>端口</div>
              <InputNumber
                value={port}
                onChange={(v) => setPort(v ?? undefined)}
                min={1}
                max={65535}
                style={{ width: '100%' }}
              />
            </div>
          )}
          {current && (
            <div style={{ width: 180 }}>
              <div className="muted" style={{ marginBottom: 4 }}>显示名（可选）</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={current.defaultName} />
            </div>
          )}
        </Space>
      </Space>
    </Modal>
  );
}
