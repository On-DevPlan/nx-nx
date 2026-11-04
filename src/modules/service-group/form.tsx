// 服务组配置表单（从视图拆出：单文件 <300 行约束）。
// 纯表单：State 形状 + 双向转换 + JSX 表单体，不含任何 API 调用。
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
  return (
    <div className="sg-form-body">
      <label className="sg-row">
        <span>显示名</span>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="我的服务" />
      </label>

      <div className="sg-section">主脚本（长驻服务，IO 重定向到日志）</div>
      <label className="sg-row">
        <span>主脚本</span>
        <select value={form.mainScript} onChange={(e) => set('mainScript', e.target.value)}>
          <option value="">（不配置）</option>
          {entryScripts.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="sg-row">
        <span>启动参数</span>
        <input value={form.mainArgs} onChange={(e) => set('mainArgs', e.target.value)} placeholder="--port 18999（空格分隔）" />
      </label>

      <div className="sg-section">活性检测（连续失败达阈值后处理）</div>
      <label className="sg-row">
        <span>启用检测</span>
        <input type="checkbox" checked={form.healthEnabled} onChange={(e) => set('healthEnabled', e.target.checked)} />
      </label>
      {form.healthEnabled && (
        <>
          <label className="sg-row">
            <span>检测方式</span>
            <select value={form.healthKind} onChange={(e) => set('healthKind', e.target.value as 'port' | 'http')}>
              <option value="port">端口可连</option>
              <option value="http">HTTP 响应</option>
            </select>
          </label>
          <label className="sg-row">
            <span>主机</span>
            <input value={form.healthHost} onChange={(e) => set('healthHost', e.target.value)} placeholder="127.0.0.1" />
          </label>
          <label className="sg-row">
            <span>端口</span>
            <input value={form.healthPort} onChange={(e) => set('healthPort', e.target.value)} placeholder="18999" />
          </label>
          {form.healthKind === 'http' && (
            <label className="sg-row">
              <span>路径</span>
              <input value={form.healthPath} onChange={(e) => set('healthPath', e.target.value)} placeholder="/health" />
            </label>
          )}
          <label className="sg-row">
            <span>间隔（ms）</span>
            <input value={form.healthIntervalMs} onChange={(e) => set('healthIntervalMs', e.target.value)} placeholder="5000" />
          </label>
          <label className="sg-row">
            <span>失败阈值</span>
            <input value={form.healthFailThreshold} onChange={(e) => set('healthFailThreshold', e.target.value)} placeholder="3" />
          </label>
          <label className="sg-row">
            <span>失活处理</span>
            <select value={form.onDead} onChange={(e) => set('onDead', e.target.value as 'restart' | 'none')}>
              <option value="restart">自愈重启</option>
              <option value="none">仅记录</option>
            </select>
          </label>
        </>
      )}

      <div className="sg-section">停止策略</div>
      <label className="sg-row">
        <span>关停脚本</span>
        <select value={form.stopScript} onChange={(e) => set('stopScript', e.target.value)}>
          <option value="">（无）</option>
          {entryScripts.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="sg-row">
        <span>兜底杀端口</span>
        <input value={form.killPort} onChange={(e) => set('killPort', e.target.value)} placeholder="如 18999（留空不启用）" />
      </label>

      <div className="sg-section">关联脚本</div>
      <label className="sg-row">
        <span>共享面板</span>
        <select value={form.shared} onChange={(e) => set('shared', e.target.value)}>
          <option value="">（无）</option>
          {panelScripts.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <div className="sg-row">
        <span>client 脚本</span>
        <div className="sg-clients">
          {entryScripts.map((s) => (
            <label key={s.name} className="sg-client">
              <input type="checkbox" checked={form.clients.includes(s.name)} onChange={() => toggleClient(s.name)} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
