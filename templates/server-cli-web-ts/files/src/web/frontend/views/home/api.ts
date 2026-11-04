// 本页对后端的**全部**调用都从这里出。
//
// 规则只有一条：页面组件不直接 import api/client，也不裸写 fetch。
// 于是「这个页面依赖哪些 action」在一个文件里就能看全，改契约时也只改这里。
// 调用本身仍走类型安全 client——action id、参数名、返回类型全由后端注册表推出。
import { useStore } from '../../store.js';
import type { GreetingResult } from '../../../../modules/home/service.js';

export interface SettingsPatchResult {
  status: 'ok' | 'skipped';
}

export function useHomeApi() {
  const { client, refreshSettings } = useStore();

  return {
    /** 演示动作：问候并累计次数 */
    greet: (name: string, loud: boolean): Promise<GreetingResult> =>
      client['home.greet']({ name, loud }),

    /** 保存设置（PATCH 语义），完成后刷新全局 settings，让导航立刻跟上 */
    async saveSettings(patch: Record<string, unknown>): Promise<SettingsPatchResult> {
      const r = await client['setting.set']({ set: patch });
      await refreshSettings();
      return { status: r.status };
    },
  };
}
