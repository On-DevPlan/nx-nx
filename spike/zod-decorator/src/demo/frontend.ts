// spike：前端「手写的那另一半」—— 交互层。
//
// 生成器给的只是「怎么调」；「什么时候调、点了之后界面怎么变」永远要手写。
// 这一层没有技术难度，但它是生成器**替代不了**的部分，也是「半自动化」里
// 那个「半」字最具体的落点。
import { createApiClient } from '../../generated/client.generated.js';
import { createHttpTransport, type Transport } from './transport.js';
import { demoGreetInput } from './schemas.js';

/** 手写的页面逻辑：按钮 → action → 状态更新 */
export function createDemoPage(transport: Transport) {
  const api = createApiClient(transport);

  return {
    /** 点「打招呼」按钮 */
    async onGreetClick(name: string, loud: boolean): Promise<string> {
      // 表单校验直接用**服务端那一份** schema（schemas.ts 是浏览器安全的，
      // 纯 zod、零 node 依赖）—— 这就是「同一份真相源三处用」：
      // 服务端校验 / 前端表单校验 / codegen 的类型来源。
      const parsed = demoGreetInput.safeParse({ name, loud });
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('；'));
      }
      const result = await api.greet(parsed.data);
      return result.greeting;
    },

    /** 点「回声」按钮（带一个 loading 态） */
    async onEchoClick(text: string, onLoading: (v: boolean) => void): Promise<string[]> {
      onLoading(true);
      try {
        const r = await api.echo({ text, repeat: 2, mode: 'plain' });
        return r.echoed;
      } finally {
        onLoading(false);
      }
    },

    /** 读一个条目（演示路由参数自动拼路径） */
    async onItemClick(id: string): Promise<string> {
      const r = await api.item({ id });
      return r.name;
    },
  };
}

/** 组装：手写 transport（部署形态）+ 生成 client（调用形态） */
export function bootstrapDemoPage(baseUrl: string, token?: string) {
  const transport = createHttpTransport(baseUrl, { token });
  return createDemoPage(transport);
}
