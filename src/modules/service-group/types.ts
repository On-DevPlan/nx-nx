// 服务组的视图类型（与 core/service/store.ts 的配置形状对齐）。

export type StopMode = 'auto' | 'script' | 'port' | 'pid';

export type LaunchParamType = 'text' | 'number' | 'select';

export interface LaunchParam {
  key: string;
  label: string;
  type: LaunchParamType;
  options?: string[];
  default?: string;
  arg?: string;
  env?: string;
  placeholder?: string;
  description?: string;
}

export interface LaunchProfile {
  name: string;
  values: Record<string, string>;
}

export interface LaunchConfig {
  params: LaunchParam[];
  profiles?: LaunchProfile[];
}

export interface GroupConfig {
  id: string;
  name: string;
  desc?: string;
  cwd?: string;
  main?: { script: string; args: string[] };
  stop?: { script: string; args: string[] };
  killPort?: number;
  stopMode: StopMode;
  health?: {
    kind: 'port' | 'http';
    port: number;
    host: string;
    path: string;
    intervalMs: number;
    failThreshold: number;
    readyTimeoutMs: number;
    onDead: 'restart' | 'none';
  };
  shared?: string;
  space?: { panel?: string; check?: string };
  clients: string[];
  launch?: LaunchConfig;
}

export interface GroupRuntime {
  status: string;
  pid?: number;
  alive?: boolean;
  detail?: string;
  failStreak: number;
  restarts: number;
  lastEvent?: string;
  logFile?: string;
  launch?: Record<string, string>;
}

export interface GroupView {
  config: GroupConfig;
  runtime: GroupRuntime;
  /** show 时附带：该组命名空间里的脚本；list 不带（避免逐组扫描磁盘）。 */
  scripts?: {
    name: string;
    path: string;
    kind: 'long' | 'short' | 'shared';
    shared: boolean;
    source: 'group' | 'external';
    size: number;
    updatedAt: number;
  }[];
}
