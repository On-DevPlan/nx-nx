// 服务组配置表单（从视图拆出：单文件 <300 行约束）。
// 纯表单：State 形状 + 双向转换 + JSX 表单体，不含任何 API 调用。
//
// 组件库：antd Form 家族（token 见 components/theme.tsx）。
// 客户端脚本区用「可排序步骤」而不是多选框——流水线的执行顺序就是配置顺序，
// 多选框表达不了顺序，用户只能靠勾选先后猜，那就等于没有流水线。
import { Form, Input, InputNumber, Select, Switch, Button, Space, Tag, Empty } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from '@ant-design/icons';
import type { GroupConfig } from './types.js';

export interface FormState {
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

export function emptyForm(): FormState {
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

export function formFromConfig(c: GroupConfig): FormState {
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

export function configFromForm(id: string, f: FormState): Record<string, unknown> {
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

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  toggleClient: (name: string) => void;
  entryScripts: { name: string }[];
  panelScripts: { name: string }[];
}

export function SgForm({ form, set, toggleClient, entryScripts, panelScripts }: Props) {
  const move = (index: number, delta: number) => {
    const next = [...form.clients];
    const target = index + delta;
    const cur = next[index];
    const other = next[target];
    // 越界或元素缺失（理论上不会发生）时直接不动——数组里没有的项不该被搬动
    if (cur === undefined || other === undefined || target < 0 || target >= next.length) return;
    next[index] = other;
    next[target] = cur;
    set('clients', next);
  };

  return (
    <Form layout="vertical" size="small" className="sg-form-body">
      <Form.Item label="显示名">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="我的服务" />
      </Form.Item>

      <Form.Item label="主脚本（长驻服务，IO 重定向到日志）">
        <Space.Compact style={{ width: '100%' }}>
          <Select
            value={form.mainScript || undefined}
            placeholder="（不配置）"
            style={{ width: '55%' }}
            onChange={(v) => set('mainScript', v ?? '')}
            options={[
              { value: '', label: '（不配置）' },
              ...entryScripts.map((s) => ({ value: s.name, label: s.name })),
            ]}
          />
          <Input
            value={form.mainArgs}
            onChange={(e) => set('mainArgs', e.target.value)}
            placeholder="--port 18999（空格分隔）"
          />
        </Space.Compact>
      </Form.Item>

      <Form.Item label="活性检测（连续失败达阈值后处理）">
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space size={8}>
            <Switch checked={form.healthEnabled} onChange={(v) => set('healthEnabled', v)} />
            <span className="muted">启用检测</span>
          </Space>
          {form.healthEnabled && (
            <>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  value={form.healthKind}
                  style={{ width: 120 }}
                  onChange={(v) => set('healthKind', v)}
                  options={[
                    { value: 'port', label: '端口可连' },
                    { value: 'http', label: 'HTTP 响应' },
                  ]}
                />
                <Input
                  value={form.healthHost}
                  onChange={(e) => set('healthHost', e.target.value)}
                  placeholder="127.0.0.1"
                  style={{ width: '30%' }}
                />
                <InputNumber
                  value={form.healthPort ? Number(form.healthPort) : undefined}
                  onChange={(v) => set('healthPort', v === null ? '' : String(v))}
                  placeholder="18999"
                  min={1}
                  max={65535}
                  style={{ width: '25%' }}
                />
                {form.healthKind === 'http' && (
                  <Input
                    value={form.healthPath}
                    onChange={(e) => set('healthPath', e.target.value)}
                    placeholder="/health"
                  />
                )}
              </Space.Compact>
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  value={Number(form.healthIntervalMs) || undefined}
                  onChange={(v) => set('healthIntervalMs', v === null ? '' : String(v))}
                  min={1000}
                  max={600000}
                  step={1000}
                  addonBefore="间隔(ms)"
                  style={{ width: '50%' }}
                />
                <InputNumber
                  value={Number(form.healthFailThreshold) || undefined}
                  onChange={(v) => set('healthFailThreshold', v === null ? '' : String(v))}
                  min={1}
                  max={100}
                  addonBefore="失败阈值"
                  style={{ width: '50%' }}
                />
              </Space.Compact>
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  value={form.onDead}
                  onChange={(v) => set('onDead', v)}
                  options={[
                    { value: 'restart', label: '失活后自愈重启' },
                    { value: 'none', label: '仅记录，不处理' },
                  ]}
                />
              </Space.Compact>
            </>
          )}
        </Space>
      </Form.Item>

      <Form.Item label="停止策略">
        <Space.Compact style={{ width: '100%' }}>
          <Select
            value={form.stopScript || undefined}
            placeholder="（无）"
            style={{ width: '50%' }}
            onChange={(v) => set('stopScript', v ?? '')}
            options={[
              { value: '', label: '（无）' },
              ...entryScripts.map((s) => ({ value: s.name, label: s.name })),
            ]}
          />
          <Input
            value={form.killPort}
            onChange={(e) => set('killPort', e.target.value)}
            placeholder="兜底杀端口（如 18999，留空不启用）"
          />
        </Space.Compact>
      </Form.Item>

      <Form.Item label="共享面板（常量 = 函数 = {}，组内脚本执行前自动装载）">
        <Select
          value={form.shared || undefined}
          placeholder="（无）"
          onChange={(v) => set('shared', v ?? '')}
          options={[
            { value: '', label: '（无）' },
            ...panelScripts.map((s) => ({ value: s.name, label: s.name })),
          ]}
        />
      </Form.Item>

      <Form.Item
        label="流水线步骤（client 脚本，按顺序依次执行）"
        extra="顺序即执行顺序：先跑上面的，再跑下面的。可用箭头调整。"
      >
        {form.clients.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未选择 client 脚本" style={{ margin: '8px 0' }} />
        ) : (
          <div className="sg-steps">
            {form.clients.map((c, i) => (
              <div key={c} className="sg-step">
                <Tag color="#8b9096">{i + 1}</Tag>
                <span className="mono sg-step-name">{c}</span>
                <Space size={2} style={{ marginLeft: 'auto' }}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`上移 ${c}`}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={i === form.clients.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`下移 ${c}`}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => toggleClient(c)}
                    aria-label={`移除 ${c}`}
                  />
                </Space>
              </div>
            ))}
          </div>
        )}
        <Select
          mode="multiple"
          placeholder="添加 client 脚本…"
          value={[]}
          onChange={(v) => v.forEach((n) => toggleClient(n))}
          style={{ width: '100%', marginTop: 6 }}
          options={entryScripts
            .filter((s) => !form.clients.includes(s.name))
            .map((s) => ({ value: s.name, label: s.name }))}
        />
      </Form.Item>
    </Form>
  );
}
