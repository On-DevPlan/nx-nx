// 模块类型：ModuleBase 是全部 action 通道（@action 装饰器 + zod 契约）的基类。
//
// serve 端的 OOP 约定：模块是 **ModuleBase 的子类**（id/title/actions 是只读成员，
// 业务编排调服务类的方法），注册表是 **Registry 类**（create 静态工厂做运行时装载
// 自检——单通道下没有编译期查重可互为备份，重复 id / 路由启动即红），
// CLI 与 HTTP 各自是 CliApp / ApiRouter / PanelServer 的实例方法。

/** 模块的运行时形状：ModuleBase 子类都满足它；Registry 与 help 只认这个。 */
export interface AnyModule {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly actions: readonly unknown[];
}

/**
 * 模块基类。子类用只读字段声明 id / title，用 @action 装饰方法声明 action：
 *
 *   export class HomeModule extends ModuleBase {
 *     readonly id = 'home';
 *     readonly title = '首页';
 *     readonly order = 1;
 *     @action({ id: 'home.greet', cli: ['greet'], http: ['POST', '/api/greet'],
 *               args: ['name'], input: homeGreetInput, output: homeGreetOutput })
 *     greet(ctx: z.output<typeof homeGreetInput>) { return this.svc.greet(ctx.name); }
 *
 *     override readonly actions = zodActionsOf(this);   // 字段放最后
 *   }
 *
 * - 业务逻辑不写在模块里：模块只做「声明 + 装配」，编排调服务类（HomeService 等）；
 * - actions 字段放最后：zodActionsOf(this) 读取 this.id，声明顺序保证它已初始化；
 * - readonly 字段保住字面量类型（`readonly id = 'home'` 的类型就是 'home'）。
 */
export abstract class ModuleBase {
  abstract readonly id: string;
  abstract readonly title: string;
  /** 排序权重，小的在前；缺省按 100。 */
  readonly order?: number;
  abstract readonly actions: readonly unknown[];
}
