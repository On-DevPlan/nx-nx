// 服务组配置表单（从视图拆出：单文件 <300 行约束）。
// 纯表单：State 形状 + 双向转换 + JSX 表单体，不含任何 API 调用。
//
// 组件库：antd Form 家族（token 见 components/theme.tsx）。
// 客户端脚本区用「可排序步骤」而不是多选框——流水线的执行顺序就是配置顺序，
// 多选框表达不了顺序，用户只能靠勾选先后猜，那就等于没有流水线。
import { Form, Input, InputNumber, Select, Switch, Space } from 'antd';
import { SpaceField } from './space-field.js';
import { StepsField } from './form-steps.js';
import type { GroupConfig, StopMode } from './types.js';

export interface FormState {
  name: string;
  mainScript: string;
  mainArgs: string;
  stopScript: string;
  killPort: string;
  stopMode: StopMode;
  healthEnabled: boolean;
  healthKind: 'port' | 'http';
  healthHost: string;
  healthPort: string;
  healthPath: string;
  healthIntervalMs: string;
  healthFailThreshold: string;
  healthReadyTimeoutMs: string;
  onDead: 'restart' | 'none';
  shared: string;
  spaceEnabled: boolean;
  spacePanel: string;
  spaceCheck: string;
  clients: string[];
}

export function emptyForm(): FormState {
  return {
    name: '',
    mainScript: '',
    mainArgs: '',
    stopScript: '',
    killPort: '',
    stopMode: 'auto',
    healthEnabled: false,
    healthKind: 'port',
    healthHost: '127.0.0.1',
    healthPort: '',
    healthPath: '/health',
    healthIntervalMs: '5000',
    healthFailThreshold: '3',
    healthReadyTimeoutMs: '20000',
    onDead: 'restart',
    shared: '',
    spaceEnabled: false,
    spacePanel: '',
    spaceCheck: 'checkUp',
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
    stopMode: c.stopMode ?? 'auto',
    healthEnabled: !!c.health,
    healthKind: c.health?.kind ?? 'port',
    healthHost: c.health?.host ?? '127.0.0.1',
    healthPort: c.health ? String(c.health.port) : '',
    healthPath: c.health?.path ?? '/health',
    healthIntervalMs: String(c.health?.intervalMs ?? 5000),
    healthFailThreshold: String(c.health?.failThreshold ?? 3),
    healthReadyTimeoutMs: String(c.health?.readyTimeoutMs ?? 20000),
    onDead: c.health?.onDead ?? 'restart',
    shared: c.shared ?? '',
    spaceEnabled: !!c.space,
    spacePanel: c.space?.panel ?? c.shared ?? '',
    spaceCheck: c.space?.check ?? 'checkUp',
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
    stopMode: f.stopMode,
    health: f.healthEnabled
      ? {
          kind: f.healthKind,
          host: f.healthHost || '127.0.0.1',
          port: num(f.healthPort),
          path: f.healthPath || '/health',
          intervalMs: Number(f.healthIntervalMs) || 5000,
          failThreshold: Number(f.healthFailThreshold) || 3,
          readyTimeoutMs: Number(f.healthReadyTimeoutMs) || 20000,
          onDead: f.onDead,
        }
      : undefined,
    shared: f.shared || undefined,
    space: f.spaceEnabled ? { panel: f.spacePanel || f.shared || undefined, check: f.spaceCheck || 'checkUp' } : undefined,
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
              <InputNumber
                value={Number(form.healthReadyTimeoutMs) || undefined}
                onChange={(v) => set('healthReadyTimeoutMs', v === null ? '' : String(v))}
                min={1000}
                max={600000}
                step={1000}
                addonBefore="启动就绪上限(ms)"
                addonAfter="冷启动慢就调大（java -jar / go build）"
                style={{ width: '100%' }}
              />
              {/* 自愈不再是表单字段：它是长脚本三动作之一，入口在状态卡的开关上。
                  这里只说明「去哪开」，避免同一件事有两个开关互相打架。 */}
              <span className="muted">
                失活后是否重启 → 由状态卡的「自愈」开关控制（当前：{form.onDead === 'restart' ? '开' : '关'}）
              </span>
            </>
          )}
        </Space>
      </Form.Item>

      <Form.Item
        label="关闭策略（stopMode）"
        extra="auto=依次兜底；port=直接杀掉占用端口的进程（最省事）；script=只跑关停脚本；pid=只杀记录的进程。"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Select
            value={form.stopMode}
            onChange={(v) => set('stopMode', v)}
            options={[
              { value: 'auto', label: 'auto · 关停脚本 → 杀端口 → 杀 pid（推荐）' },
              { value: 'script', label: 'script · 只跑关停脚本（优雅退出）' },
              { value: 'port', label: 'port · 直接杀端口占用进程' },
              { value: 'pid', label: 'pid · 只杀运行态记录的 pid' },
            ]}
          />
          {form.stopMode !== 'pid' && (
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={form.stopScript || undefined}
                placeholder="关停脚本（可选）"
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
                placeholder="杀哪个端口（留空则用探活端口）"
              />
            </Space.Compact>
          )}
        </Space>
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

      <SpaceField form={form} set={set} panelScripts={panelScripts} shared={form.shared} />

      <StepsField
        clients={form.clients}
        entryScripts={entryScripts}
        setClients={(next) => set('clients', next)}
        toggleClient={toggleClient}
      />
    </Form>
  );
}
