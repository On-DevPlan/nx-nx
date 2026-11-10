// spike：前端「手写的那一半」—— 传输层。
//
// 这一层 codegen 生成不了，也不该生成：它装的是**部署形态**的知识
// （base url 在哪、鉴权头叫什么、错误信封长什么样、超时多久）。
// 换个部署方式就要改这里，而 action 声明一个字都不用动。
//
// 这就是「apiclient 半自动化」的具体含义：
//   自动的部分 = 每个 action 的调用形态、类型、路由、校验
//   手写的部分 = 一次调用怎么发出去、失败了怎么办
export interface Transport {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

export interface TransportOptions {
  /** 鉴权 token（放 Authorization 头） */
  token?: string;
  /** 超时毫秒 */
  timeoutMs?: number;
}

export function createHttpTransport(baseUrl: string, opts: TransportOptions = {}): Transport {
  return {
    async request(method: string, path: string, body?: unknown): Promise<unknown> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
      try {
        const res = await fetch(baseUrl + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = (await res.json()) as { ok: boolean; data?: unknown; error?: string };
        // 错误信封的拆解是手写的：生成器不知道后端把错误包成什么形状
        if (!payload.ok) throw new Error(payload.error ?? `请求失败: ${method} ${path}`);
        return payload.data;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
