// Skill模块：随包分发的 skill 的发现与安装。
//
// **模块的形状：一条 action 一个文件**——
//   actions/<名>.ts   声明（@action 元数据）与实现同文件；契约常量在 ../schemas.ts
//   actions/_manifest.generated.ts   codegen 产物：收进本目录所有 ActionBase 子类
//   index.ts（本文件）只做装配：模块元信息 + 用容器把清单里的类建成 action
//
// **IoC 自动注册**：清单由 `pnpm gen:actions` 扫 actions/ 目录生成，模块不手工
// 列举 action 类——加一条 action = 新建一个文件 + 跑一次生成，本文件零改动。
// 依赖经容器注入（action 类的构造函数只接容器，用 `this.deps.get('store')` 取）。
//
// 单通道：action 一律 @action 装饰器声明（zod schema 即契约），没有第二条通道。
import { ModuleBase } from '../../runtime/types/module.js';
import { zodActionsOf } from '../../runtime/action-decorator.js';
import type { ZodBoundAction } from '../../runtime/action-decorator.js';
import { container } from '../../runtime/container.js';
import type { Container } from '../../runtime/container.js';
import { ACTIONS } from './actions/_manifest.generated.js';

export class SkillModule extends ModuleBase {
  override readonly id = 'skill';
  override readonly title = 'Skill';
  override readonly order = 20;

  // actions 在构造期组装（依赖要先就绪），故用确定赋值断言而非字段初始化器。
  override readonly actions!: ZodBoundAction[];

  constructor(c: Container = container) {
    super();
    this.actions = ACTIONS.flatMap((Cls) => zodActionsOf(c.create(Cls)));
  }
}

export const skillModule = new SkillModule();
