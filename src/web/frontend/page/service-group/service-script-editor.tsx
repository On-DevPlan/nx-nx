// 服务自己的四个脚本：启动 / 停止 / 探活 / 共享面板。
// 这里只编辑本组命名空间里的文件，不展示全局脚本模块，也不让用户从空文件开始。
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Input, Select, Space, Spin, Tabs, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useToast } from '../../components/ui.jsx';
import { useStore } from '../../store.jsx';
import type { ServiceGroupConfig } from '../../../../core/service/store.js';

interface ScriptRow {
  name: string;
  shared: boolean;
}

interface Props {
  groupId: string;
  config: ServiceGroupConfig;
  scripts: ScriptRow[];
}

type RoleKey = 'main' | 'stop' | 'probe' | 'shared';

const ROLES: { key: RoleKey; label: string; script?: (c: ServiceGroupConfig) => string | undefined; hint: string }[] = [
  { key: 'main', label: '启动', script: (c) => c.main?.script, hint: '长驻服务入口' },
  { key: 'stop', label: '停止', script: (c) => c.stop?.script, hint: '优雅关停' },
  { key: 'probe', label: '探活', script: (c) => c.probe?.script, hint: '退出码 0 = 活' },
  { key: 'shared', label: '共享', script: (c) => c.shared || c.space?.panel, hint: '常量 + 函数 + 数据' },
];

export function ServiceScriptEditor({ groupId, config, scripts }: Props) {
  const { client } = useStore();
  const toast = useToast();
  const [role, setRole] = useState<RoleKey>('main');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const candidates = scripts.filter((s) => (role === 'shared' ? s.shared : !s.shared));

  const load = useCallback(
    async (nextRole: RoleKey, forcedName?: string) => {
      const def = ROLES.find((r) => r.key === nextRole)!;
      const configured = def.script?.(config);
      const pool = scripts.filter((s) => (nextRole === 'shared' ? s.shared : !s.shared));
      const picked = forcedName ?? configured ?? pool[0]?.name ?? '';
      setName(picked);
      if (!picked) {
        setContent('');
        setDirty(false);
        return;
      }
      setLoading(true);
      try {
        const r = await client['serviceGroup.script']({ id: groupId, op: 'read', name: picked });
        setContent(String((r as { content?: string })?.content ?? ''));
        setDirty(false);
      } catch (e: unknown) {
        toast('读取失败: ' + String((e as { message?: string })?.message || e));
      } finally {
        setLoading(false);
      }
    },
    [client, config, groupId, scripts, toast],
  );

  useEffect(() => {
    void load(role);
    // scripts / config 变化由用户切 Tab 或刷新触发，避免保存后反复覆盖正在编辑的内容。
  }, [role, groupId]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const exists = scripts.some((s) => s.name === name);
      await client['serviceGroup.script']({
        id: groupId,
        op: exists ? 'save' : 'create',
        name: name.trim(),
        content,
      });
      setDirty(false);
      toast(`已保存 ${name.trim()}`);
    } catch (e: unknown) {
      toast('保存失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const current = ROLES.find((r) => r.key === role)!;

  return (
    <Card
      size="small"
      title="服务脚本"
      extra={
        <Space size={6}>
          <Select
            size="small"
            value={name || undefined}
            placeholder="选择脚本"
            style={{ width: 200 }}
            onChange={(v) => void load(role, String(v))}
            options={candidates.map((s) => ({ value: s.name, label: s.name }))}
          />
          <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || !name} onClick={() => void save()}>
            保存脚本
          </Button>
        </Space>
      }
    >
      <Tabs
        size="small"
        activeKey={role}
        onChange={(k) => setRole(k as RoleKey)}
        items={ROLES.map((r) => ({ key: r.key, label: r.label }))}
      />
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {current.hint} · 当前服务：{name || '未配置'}
      </Typography.Text>
      {!candidates.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这个角色还没有脚本" />
      ) : loading ? (
        <Spin size="small" />
      ) : (
        <Input.TextArea
          className="mono sg-script-code"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          autoSize={{ minRows: 16, maxRows: 28 }}
          spellCheck={false}
        />
      )}
    </Card>
  );
}
