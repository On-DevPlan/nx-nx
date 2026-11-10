// IoC 容器：依赖的**注册与解析**都在这里，业务代码只声明「我需要什么」。
//
// 为什么需要它（而不是模块手工 new 每个 action 类）：
//   - **加一条 action 零登记**——新文件 → codegen 收进 manifest → 模块自动装配；
//   - 依赖不在 action 的构造函数里点名（`new GreetAction(store)`），而是运行时
//     按 key 取（`this.deps.get('store')`）——于是测试可以换一整个容器，
//     而不是逐个改构造参数；
//   - 依赖缺失在**取用时**报错并点名 key，不会变成 undefined 传导到深处。
//
// 容器是进程级单例（默认容器已注册 core 的共享依赖）；模块也可以传自己的容器
// （测试里造一个只带临时 store 的容器即可）。
import { store as defaultStore } from '../core/store.js';

export class Container {
  private readonly providers = new Map<string, unknown>();

  /** 注册一个依赖（后注册覆盖先注册）。链式返回自己，便于一行装配。 */
  register<T>(key: string, value: T): this {
    this.providers.set(key, value);
    return this;
  }

  /** 取依赖；没注册就报错并点名 key（早失败，且信息可用）。 */
  get<T>(key: string): T {
    if (!this.providers.has(key)) {
      throw new Error(`依赖未注册: ${key}（已注册: ${[...this.providers.keys()].join(', ') || '无'}）`);
    }
    return this.providers.get(key) as T;
  }

  /** 用容器建实例：action 类的构造函数统一只接容器本身。 */
  create<T>(cls: new (deps: Container) => T): T {
    return new cls(this);
  }
}

/** 进程级默认容器：共享依赖在这里注册一次，全项目可用。 */
export const container = new Container().register('store', defaultStore);
