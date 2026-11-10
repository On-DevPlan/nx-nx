// 全局面板状态：bootstrap 数据 + 设置 + 类型安全客户端。
//
// 这里**只放跨页面共享的东西**。当前在哪一页、筛选条件、选中项一律不进 store——
// 它们是 URL 的一部分（路由与 searchParams），刷新/分享/后退天然可用。
// 旧骨架把当前视图存在 store + localStorage 里，再用三个 useEffect 和 hash 对齐，
// 本质是在手写一个功能不全的 router。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api/client.js';
import { makeTypedClient } from './api/typed-client.js';
import type { TypedClient } from '../../runtime/types/client.js';
import type { MODULES } from '../../runtime/registry.js';
import type { CommandEntry } from '../../runtime/help.js';

// bootstrap 数据形状（与 modules/home 的 bootstrap() 返回一致）
export interface BootData {
  app: { name: string; title: string; description: string; version: string };
  storePath: string;
  storeEnv: string;
  commands: CommandEntry[];
}

// 面板的设置数据。
// **不含页面清单**：有哪些页面是前端路由树的事实（见 app/pages.ts），
// 后端只保存「谁摆在哪」这一份摆法，不负责回答「有哪些页」。
export interface SettingsResponse {
  settings: {
    navGroups: { title: string; views: string[] }[];
    navHidden: string[];
    navOrder: string[];
    theme: string;
  };
  schema: { key: string; hint: string }[];
}

interface StoreValue {
  boot: BootData | null;
  settings: SettingsResponse | null;
  client: TypedClient<typeof MODULES>;
  refreshBoot: () => Promise<BootData>;
  refreshSettings: () => Promise<SettingsResponse>;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootData | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  const refreshBoot = useCallback(async () => {
    const b = await api<BootData>('/api/bootstrap');
    setBoot(b);
    return b;
  }, []);

  const refreshSettings = useCallback(async () => {
    const s = await api<SettingsResponse>('/api/settings');
    setSettings(s);
    return s;
  }, []);

  useEffect(() => {
    refreshBoot().catch(() => {});
    // 导航摆法（分组 / 隐藏 / 顺序）与主题一起拿；失败不阻塞面板其余部分
    refreshSettings().catch(() => {});
  }, [refreshBoot, refreshSettings]);

  // typed client：延迟读取 boot.commands，启动完成前调用会得到明确报错
  const client = useMemo(() => makeTypedClient(() => boot?.commands), [boot]);

  const value = useMemo(
    () => ({ boot, settings, client, refreshBoot, refreshSettings }),
    [boot, settings, client, refreshBoot, refreshSettings],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
