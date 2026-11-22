// 服务组的视图类型（与 core/service/store.ts 的配置形状对齐）。

export type StopMode = 'auto' | 'script' | 'port' | 'pid';

/** 一条启动脚本（版本）：完整命令，不再有「参数表单」这一层。 */
export interface LaunchEntry {
  name: string;
  script?: string;
  args: string[];
  env: Record<string, string>;
  port?: number;
  desc?: string;
}

export interface LaunchConfig {
  entries: LaunchEntry[];
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
  entry?: string;
  port?: number;
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
