// 本页对后端的**全部**调用都从这里出。
//
// 规则只有一条：页面组件不直接 import api/client，也不裸写 fetch。
// 于是「这个页面依赖哪些 action」在一个文件里就能看全，改契约时也只改这里。
// 调用本身仍走类型安全 client——action id、参数名、返回类型全由后端注册表推出。
import { api } from '../../api/client.js';
import { createApiClient, type Transport } from '../../api/client.generated.js';
import { useStore } from '../../store.js';
import type { GreetingResult } from '../../../../modules/home/schemas.js';

export interface SettingsPatchResult {
  status: 'ok' | 'skipped';
}

// codegen apiclient 的传输层（手写的那一半）：api() 已拆好错误信封与超时。
// 类型标 Transport['request']（不是 Transport）：裸箭头函数赋给带属性的接口
// 既不可赋值、参数也拿不到上下文类型。
const request: Transport['request'] = (method, path, body) => api(path, { method, body });

export function useHomeApi() {
  const { refreshSettings } = useStore();
  // zod 通道的 action（@action 装饰）走生成的 apiclient；
  // builder 通道（如 skill 域）仍走 client[...] typed client——两条通道并存。
  const generated = createApiClient({ request });

  return {
    /** 演示动作：问候并累计次数（codegen client：类型来自 zod schema） */
    greet: (name: string, loud: boolean): Promise<GreetingResult> =>
      generated.greet({ name, loud }),

    /** 保存设置（PATCH 语义），完成后刷新全局 settings，让导航立刻跟上 */
    async saveSettings(patch: Record<string, unknown>): Promise<SettingsPatchResult> {
      const r = await generated.set({ set: patch });
      await refreshSettings();
      return { status: r.status };
    },
  };
}
