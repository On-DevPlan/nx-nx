// 进程内事件总线：变更通知标准的背骨。
//
// 标准的形状（刻意保持极简）：
//   - 通知**不带业务 payload**——只是一句「topic 变了」；前端收到后自己重新
//     fetch。这让通知通道与数据形状彻底解耦：加字段不用改通知，改通知不碰数据。
//   - publish 的 topic 是字符串（约定如 'store' / 'settings' / 模块名.实体名），
//     消费方按前缀/全等过滤。
//
// 已知边界（写进文档、别假装没有）：总线是**进程内**的。serve 面板里发生的写入
// （HTTP action）会推给同一进程的 SSE 连接；CLI 是另一个进程，它写 store 时面板
// 收不到通知——跨进程的可见性靠 JsonStore 的 mtime 失效检测，在面板下次读取时
// 生效。要跨进程实时，将来在 store 落盘点加文件 watch 即可，总线形状不用变。
//
// 放 core 的原因：platform 模块（events 端点）与 core（store 写入）都要用，
// 分层上 core 是它们共同的下游。

/** 监听器：收到通知时拿到 topic。 */
export type ChangeListener = (topic: string) => void;

const listeners = new Set<ChangeListener>();

/** 订阅变更通知；返回取消订阅函数（SSE 断开 / 组件卸载时必须调用）。 */
export function subscribe(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 发布一条变更通知。同步派发给当前全部监听器（监听器里不要做重活）。 */
export function publish(topic: string): void {
  for (const fn of listeners) {
    try {
      fn(topic);
    } catch {
      // 单个监听器抛错不能中断其余派发，也不能把错误抛进写入方的事务
    }
  }
}

/** 当前监听器数量（测试与自检用）。 */
export function subscriberCount(): number {
  return listeners.size;
}
