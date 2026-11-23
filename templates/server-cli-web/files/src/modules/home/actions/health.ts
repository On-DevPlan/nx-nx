// home.health —— 存储自检：触碰一次存储（读出来原样写回），验证整条读写链路。
//
// 契约（zod schema）就声明在本文件里——入参类型由基类泛型模板封装；
// 本文件只做「声明 + 实现」，业务在服务层。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import { storePathFromEnv } from '../../../core/paths.js';

/** home.health 的入参契约（无参数）。 */
const input = z.object({});

export class HealthAction extends ActionBase<typeof input> {
  @action({
    id: 'home.health',
    cli: ['health'],
    http: ['GET', '/api/health'],
    summary: '自检：存储目录是否可写',
    input,
    render: (r) => (r.status === 'ok' ? `正常 · 存储 ${r.storePath}` : `异常 · ${r.reason}`),
  })
  override async run(_ctx: ActionInput<this['_input']>) {
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
