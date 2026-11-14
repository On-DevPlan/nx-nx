// 全局面板状态：bootstrap 数据 + 会话级选择 + 类型安全客户端。
//
// 状态容器换成 zustand 的原因（原来是一个 Context + useState 的 Provider）：
//   - 视图只关心「自己用到的那几个字段」，Context 一变整棵树重渲染；
//   - UI 选择的持久化要手写 effect + 字段合并，多一个字段就多一处漏；
//   - 非组件代码（如 hash 同步、快捷键、轮询回调）想读状态得绕一层。
// zustand 三件事一次解决：选择器订阅、persist 中间件、getState() 直读。
//
// 关键约定不变：凡是「刷新后不该丢」的用户选择（当前视图、下拉与勾选）
// 一律持久化到 localStorage——**UI 状态持久化是硬标准，不是可选项**。
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api/client.js';
import { makeTypedClient } from './api/typed-client.js';
import type { TypedClient } from '../../runtime/types/client.js';
import type { MODULES } from '../../runtime/registry.js';
import type { CommandEntry } from '../../runtime/help.js';
import type { BrokenTemplate, TemplateMeta } from '../../core/templates.js';

const LS_KEY = 'nx-nx-ui';

// bootstrap 数据形状（与 modules/system 的 bootstrap() 返回一致）
export interface BootData {
  app: { name: string; title: string; description: string; version: string };
  storePath: string;
  storeEnv: string;
  templatesDir: string;
  templates: TemplateMeta[];
  templateErrors: BrokenTemplate[];
  commands: CommandEntry[];
}

// 只持久化「选择」，不持久化「数据」——数据永远从 /api 拉，避免陈旧缓存。
interface UiState {
  view: string;
}

const DEFAULT_UI: UiState = { view: 'create' };

interface ShellStore {
  boot: BootData | null;
  ui: UiState;
  setBoot: (b: BootData) => void;
  patchUi: (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => void;
}

export const useShell = create<ShellStore>()(
  persist(
    (set) => ({
      boot: null,
      ui: { ...DEFAULT_UI },
      setBoot: (boot) => set({ boot }),
      patchUi: (patch) =>
        set((s) => ({
          ui: { ...s.ui, ...(typeof patch === 'function' ? patch(s.ui) : patch) },
        })),
    }),
    {
      name: LS_KEY,
      // 只落 ui：boot 是服务端事实，不该被缓存成过期快照
      partialize: (s) => ({ ui: s.ui }),
      // 老版本存的是扁平对象（{view}），合并到 ui 里即可，不需要版本迁移
      merge: (persisted, current) => {
        const p = persisted as { ui?: Partial<UiState>; view?: string } | undefined;
        const ui = { ...DEFAULT_UI, ...(p?.ui ?? (p?.view ? { view: p.view } : {})) };
        return { ...current, ui };
      },
    },
  ),
);

// boot 的拉取放在组件外：任何地方都能 await 它，不依赖 React 生命周期
async function loadBoot(): Promise<BootData> {
  const b = await api<BootData>('/api/bootstrap');
  useShell.getState().setBoot(b);
  return b;
}

export interface StoreValue {
  boot: BootData | null;
  ui: UiState;
  client: TypedClient<typeof MODULES>;
  patchUi: ShellStore['patchUi'];
  refreshBoot: () => Promise<BootData>;
}

/** 视图的取数入口：保持原有形状，视图代码不需要知道状态库换了 */
export function useStore(): StoreValue {
  const boot = useShell((s) => s.boot);
  const ui = useShell((s) => s.ui);
  const patchUi = useShell((s) => s.patchUi);
  // typed client：延迟读取 boot.commands，启动完成前调用会得到明确报错
  const client = useMemo(() => makeTypedClient(() => boot?.commands), [boot]);
  return { boot, ui, client, patchUi, refreshBoot: loadBoot };
}

/** 启动时拉一次 bootstrap；之后由窗口聚焦/手动刷新驱动 */
export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    loadBoot().catch(() => {
      // 服务没起时首页本来就该是空态——不弹错误，顶部状态点会显示离线
    });
  }, []);
  return <>{children}</>;
}
