// home.health —— 存储自检：触碰一次存储（读出来原样写回），验证整条读写链路。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import { storePathFromEnv } from '../../../core/paths.js';
import { homeHealthInput } from '../schemas.js';

export class HealthAction extends ActionBase {
  @action({
    id: 'home.health',
    cli: ['health'],
    http: ['GET', '/api/health'],
    summary: '自检：存储目录是否可写',
    input: homeHealthInput,
    render: (r) => (r.status === 'ok' ? `正常 · 存储 ${r.storePath}` : `异常 · ${r.reason}`),
  })
  async health(_ctx: z.output<typeof homeHealthInput>) {
    const store = this.deps.get('store');
    try {
      const s = await store.load();
      await store.save(s);
      return { status: 'ok' as const, storePath: storePathFromEnv(), reason: '' };
    } catch (err) {
      return {
        status: 'blocked' as const,
        storePath: storePathFromEnv(),
        reason: String((err as { message?: string })?.message || err),
      };
    }
  }
}
