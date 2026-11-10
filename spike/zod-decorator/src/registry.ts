// spike：注册表 —— 从「带装饰器的类」收集 action 列表并做装载期自检。
//
// 与现有模型的对照（这是验证的一部分，不只是实现）：
//
//   现有：defineAction({...})(run, render) —— 两段式，编译器从**字面量**推出
//         ctx 类型、run 返回值类型、路由 :param 与 args 的一致性。
//   本 spike：@action({...}) 装饰方法 —— 元数据是**运行期对象**，类型靠
//         `z.input<typeof schema>` 手写引用；路由一致性从编译期降级为运行期检查。
//
// 这条降级是「注解方式」的固有代价：装饰器拿不到字面量形状，编译器也就无从
// 校验「路由 :param 是否在 args 里声明」。现有模型里那条是编译错误（ParamsCovered），
// 这里只能启动时报错。结论见 README §3。
import { metaOf, type ActionMeta } from './action.js';

export interface ActionDef extends ActionMeta {
  module: string;
  /** 所属模块的标题（buildRegistry 填）——面板与 tree 快照里显示用 */
  moduleTitle: string;
  method: string;
  run: (input: unknown) => unknown | Promise<unknown>;
}

export interface ModuleDef {
  id: string;
  title: string;
  actions: ActionDef[];
}

/**
 * 收集一个类里被 @action 标注的方法。
 *
 * handler 以**实例**为 `this` 调用（注解式的卖点就是「声明与实现写在一起、
 * 类可以持有状态」——若把 prototype 上的方法当自由函数调用，`this` 是 undefined，
 * 类里的字段一个都用不了）。
 *
 * 类必须有无参构造函数：这里会 `new` 一个实例作为 handler 的接收者。
 * 收集时用 `getOwnPropertyDescriptor` 取值而不是 `proto[name]`——
 * 后者会**执行 getter**，只为了看一眼它有没有被装饰器标过。
 */
export function collectActions(moduleId: string, cls: new () => object): ActionDef[] {
  const proto = cls.prototype;
  const instance = new cls();
  const out: ActionDef[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const method = descriptor?.value;
    if (typeof method !== 'function') continue;
    const meta = metaOf(method);
    if (!meta) continue;
    out.push({
      ...meta,
      module: moduleId,
      moduleTitle: '',
      method: name,
      run: (input: unknown) => (method as (i: unknown) => unknown).call(instance, input),
    });
  }
  return out;
}

/** 路由模式里的 :param */
export function routeParams(pattern: string): string[] {
  return [...pattern.matchAll(/:([\w-]+)/g)].map((m) => m[1]!);
}

/**
 * 装载期自检：id 重复 / CLI 路径重复 / 路由 :param 未在 args 中声明。
 * 现有模型里第 1、2 条在编译期就红（defineModules 的 RegistryChecks），
 * 这里只能在启动时红 —— 代价记录在案。
 */
export function buildRegistry(modules: ModuleDef[]): ActionDef[] {
  const seenIds = new Set<string>();
  const seenCli = new Set<string>();
  const actions: ActionDef[] = [];

  for (const mod of modules) {
    for (const raw of mod.actions) {
      const a: ActionDef = { ...raw, moduleTitle: mod.title };
      if (seenIds.has(a.id)) throw new Error(`action id 重复: ${a.id}`);
      seenIds.add(a.id);

      for (const path of [a.cli, ...(a.aliases ?? [])]) {
        const key = path.join(' ');
        if (seenCli.has(key)) throw new Error(`CLI 命令重复: ${key}（action ${a.id}）`);
        seenCli.add(key);
      }

      if (a.http) {
        const declared = new Set(a.args ?? []);
        for (const p of routeParams(a.http[1])) {
          if (!declared.has(p)) {
            throw new Error(
              `action ${a.id} 的路由 ${a.http[1]} 含 :${p}，但 args 里没声明同名位置参数` +
                '（运行时会是 undefined）',
            );
          }
        }
      }
      actions.push(a);
    }
  }
  return actions;
}
