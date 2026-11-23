// 变更通知的前端接线：共享单例 EventSource + useLiveTopic。
//
// 标准（与后端 core/events.ts 对齐）：通知只是一句「topic 变了」，不带业务
// payload——收到通知的组件自己重新 fetch。于是这里不需要任何数据形状知识，
// 一个 EventSource 服务全部订阅者。
//
// 为什么是共享单例：EventSource 每条都是一条 HTTP 长连（服务端一个订阅者
// + 一份心跳）。十个组件各开一条 = 十倍长连与心跳；单例 + 引用计数让
// 「最后一个组件卸载」才真正断开。
import { useEffect } from 'react';

type TopicListener = () => void;

const listeners = new Map<string, Set<TopicListener>>();
let source: EventSource | null = null;

function ensureSource(): void {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  source.addEventListener('changed', (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent<string>).data) as { topic: string };
      // 精确订阅的收到自己的 topic；'*' 订阅全部（调试/全局刷新用）
      for (const fn of listeners.get(data.topic) ?? []) fn();
      for (const fn of listeners.get('*') ?? []) fn();
    } catch {
      /* 帧不是合法 JSON：丢帧不崩溃，下一帧还能收 */
    }
  });
  // 浏览器 EventSource 自带断线重连（服务端写了 retry: 3000），这里不额外处理
}

function releaseSourceIfIdle(): void {
  if (listeners.size === 0 && source) {
    source.close();
    source = null;
  }
}

/** 订阅某个 topic 的变更通知；返回取消函数。 */
export function onTopic(topic: string, fn: TopicListener): () => void {
  const set = listeners.get(topic) ?? new Set<TopicListener>();
  set.add(fn);
  listeners.set(topic, set);
  ensureSource();
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(topic);
    releaseSourceIfIdle();
  };
}

/**
 * 组件级订阅：topic 有变更时调 onRefresh（通常是重新 fetch）。
 * onRefresh 建议传 useCallback 的稳定引用；refreshSettings 这类已经满足。
 */
export function useLiveTopic(topic: string, onRefresh: TopicListener): void {
  useEffect(() => onTopic(topic, onRefresh), [topic, onRefresh]);
}
