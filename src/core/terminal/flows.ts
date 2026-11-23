// 交互流程注册表：core 不认识任何具体业务，功能域自己登记。
//
// 为什么要有这一层：
//   runtime 的 CLI 需要「这条 action 走交互流程」的通用能力，
//   但 runtime 不该知道 git 模块的存在（那会让装配层反向依赖业务）。
//   于是：功能域在装载时 registerFlow，runtime 只按名字取。
//
// 装载期自检由 runtime/registry.ts 负责：声明了 interactive.flow 却没登记的，
// 启动时就报错，而不是等用户敲到那条命令才炸。
export interface FlowOutcome {
  /** 流程是否已经自己打印过结果——true 时 action 的 render 不该再打印一遍 */
  printed: boolean;
  /** 交给 action 的 render 的数据 */
  data?: unknown;
}

export type FlowFactory = (ctx: Record<string, unknown>) => Promise<FlowOutcome> | FlowOutcome;

const registry = new Map<string, FlowFactory>();

export function registerFlow(name: string, factory: FlowFactory): void {
  if (registry.has(name)) throw new Error(`交互流程重复注册: ${name}`);
  registry.set(name, factory);
}

export function getFlow(name: string): FlowFactory | undefined {
  return registry.get(name);
}

export function flowNames(): string[] {
  return [...registry.keys()];
}
