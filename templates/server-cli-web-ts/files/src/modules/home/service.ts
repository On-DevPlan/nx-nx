// home 域业务逻辑：纯业务函数 + 状态存储，不做 HTTP/CLI 装配。
import { mutateStore } from '../../core/store.js';

export interface GreetingResult {
  greeting: string;
  name: string;
  count: number;
  at: string;
}

// 打个招呼，并把问候次数累计进本机存储——演示「面板操作 → 状态落盘」闭环。
//
// 走 mutateStore 读-改-写事务：计数 +1 与落盘是一个原子动作，
// 两个并发请求不会丢计数，函数抛错则半个事务不会写进磁盘。
export async function greet(name: string, loud = false): Promise<GreetingResult> {
  const t = await mutateStore((s) => {
    const count = Number(s.greetCount || 0) + 1;
    s.greetCount = count;
    return count;
  });
  const count = Number(t);

  let greeting = `你好，${name}！这是第 ${count} 次问候。`;
  if (loud) greeting = greeting.toUpperCase();
  return { greeting, name, count, at: new Date().toISOString() };
}
