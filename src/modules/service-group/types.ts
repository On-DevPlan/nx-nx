// 服务组的视图类型（与 core/service/store.ts 的配置形状对齐）。

export interface GroupConfig {
  id: string;
  name: string;
  main?: { script: string; args: string[] };
  stop?: { script: string; args: string[] };
  killPort?: number;
  health?: {
    kind: 'port' | 'http';
    port: number;
    host: string;
    path: string;
    intervalMs: number;
    failThreshold: number;
    onDead: 'restart' | 'none';
  };
  shared?: string;
  space?: { panel?: string; check?: string };
  clients: string[];
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
}

export interface GroupView {
  config: GroupConfig;
  runtime: GroupRuntime;
}
