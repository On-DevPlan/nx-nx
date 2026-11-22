// 服务组配置表单（从视图拆出：单文件 <300 行约束）。
// 纯表单：State 形状 + 双向转换 + JSX 表单体，不含任何 API 调用。
//
// 组件库：antd Form 家族（token 见 components/theme.tsx）。
// 本表单只管「配置一次」的字段；测试脚本组（工作流）在设置页的流水线 Tab 里编辑。
import { Form, Input, InputNumber, Select, Switch, Space } from 'antd';
import { joinArgsText, splitArgsText } from './args-text.js';
import { SpaceField } from './space-field.js';
import type { GroupConfig, StopMode } from './types.js';

/** 启动脚本编辑器里的字符串形态：参数 / 环境变量用文本编辑，保存时再解析。 */
export interface LaunchEntryForm {
  name: string;
  script: string;
  argsText: string;
  envText: string;
  port: string;
  desc: string;
}

export interface FormState {
  name: string;
  desc: string;
  cwd: string;
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
  launchEntries: LaunchEntryForm[];
}

export function emptyForm(): FormState {
  return {
    name: '',
    desc: '',
    cwd: '',
    mainScript: '',
    mainArgs: '',
    stopScript: '',
    killPort: '',
    stopMode: 'auto',
    // 默认值对齐模板 node-ping：端口 18080、HTTP /ping。
    // 检测开关仍是关的（没选主脚本就开检测没有意义），但一打开就是能用的值，
    // 不用先去猜「端口填什么、路径填什么」。
    healthEnabled: false,
    healthKind: 'http',
    healthHost: '127.0.0.1',
    healthPort: '18080',
    healthPath: '/ping',
    healthIntervalMs: '5000',
    healthFailThreshold: '3',
    healthReadyTimeoutMs: '20000',
    onDead: 'restart',
    shared: '',
    spaceEnabled: false,
    spacePanel: '',
    spaceCheck: 'checkUp',
    clients: [],
    launchEntries: [],
  };
}

export function formFromConfig(c: GroupConfig): FormState {
  return {
    name: c.name,
    desc: c.desc ?? '',
    cwd: c.cwd ?? '',
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
    launchEntries: (c.launch?.entries ?? []).map((e) => ({
      name: e.name,
      script: e.script ?? '',
      argsText: joinArgsText(e.args),
      envText: Object.entries(e.env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
      port: e.port ? String(e.port) : '',
      desc: e.desc ?? '',
    })),
  };
}

export function configFromForm(id: string, f: FormState): Record<string, unknown> {
  const num = (s: string) => (s.trim() ? Number(s.trim()) : undefined);
  const entries = f.launchEntries
    .filter((e) => e.name.trim())
    .map((e) => {
      const env: Record<string, string> = {};
      for (const line of e.envText.split(/\r?\n|,/)) {
        const at = line.indexOf('=');
        if (at <= 0) continue;
        const k = line.slice(0, at).trim();
        if (k) env[k] = line.slice(at + 1).trim();
      }
      return {
        name: e.name.trim(),
        script: e.script.trim() || undefined,
        args: splitArgsText(e.argsText),
        env,
        port: num(e.port),
        desc: e.desc.trim() || undefined,
      };
    });
  return {
    name: f.name || id,
    desc: f.desc.trim() || undefined,
    cwd: f.cwd.trim() || undefined,
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
    launch: entries.length ? { entries } : undefined,
  };
}

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  entryScripts: { name: string }[];
  panelScripts: { name: string }[];
}

export function SgForm({ form, set, entryScripts, panelScripts }: Props) {
  return (
    <Form layout="vertical" size="small" className="sg-form-body">
      <Form.Item label="显示名">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="我的服务" />
      </Form.Item>

      <Form.Item label="说明（desc）" extra="首页会显示这段话：这个服务跑什么、给谁用。">
        <Input.TextArea
          value={form.desc}
          onChange={(e) => set('desc', e.target.value)}
          placeholder="例如：客户查询 API，长驻 Node 进程，端口 18080"
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </Form.Item>

      <Form.Item
        label="工作目录（cwd）"
        extra="服务进程在这里运行；client 产物 / 测试数据也落这里。留空用默认目录。"
      >
        <Input
          value={form.cwd}
          onChange={(e) => set('cwd', e.target.value)}
          placeholder="C:\\Users\\...\\services\\groups\\<组 id>"
          className="mono"
        />
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
              {/* 自愈开关放在设置页：首页只留探活/启动/停止三个按钮，
                  避免「自愈」和「启动」两个开关在同一张卡上互相打架。 */}
              <Space size={8}>
                <Switch
                  checked={form.onDead === 'restart'}
                  onChange={(v) => set('onDead', v ? 'restart' : 'none')}
                />
                <span className="muted">失活后自动重启（自愈）</span>
              </Space>
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
    </Form>
  );
}
