// 编程入口：供其他工具 / agent 以库方式调用。
// 导出的是服务与装配类（业务真相源），不是 CLI/HTTP 壳的散函数——库用方自己组织 I/O。
export * as errors from './core/errors/index.js';
export { store, JsonStore, type StoreState, type Settings } from './core/store.js';

// 各业务域：模块类（装配）+ 域内规则
export { HomeModule, homeModule } from './modules/home/index.js';
export * as homeSettings from './modules/home/settings.js';
export { SkillModule, skillModule } from './modules/skill/index.js';
export { PlatformModule, platformModule } from './modules/platform/index.js';

// 装配层
export { Registry, registry, MODULES, ACTIONS } from './runtime/registry.js';
export { ApiRouter } from './runtime/api.js';
export { PanelServer, startServer } from './runtime/server.js';
export { CliApp, runCli } from './runtime/cli.js';

// IoC 与 action 基类
export { Container, container } from './runtime/container.js';
export { ActionBase } from './runtime/action-base.js';
export { action, zodActionsOf } from './runtime/action-decorator.js';
