# 00 · 产品说明

## 这个工具解决什么问题

「本机工具类项目」常见形态：一个命令行程序处理实际工作，再配一个浏览器面板做
可视化操作。从零搭这样一个项目要反复处理：

- CLI 命令表与 HTTP 路由表各写一份，加功能时两处容易分叉
- 前端壳、构建链（TS / Vite / tsc）、静态资源服务的拼装
- 状态存储的原子写、环境隔离
- 发版流水线（GitHub Actions、npm 发布与来源签名）

nx-nx 把这套在多个真实项目上验证过的骨架沉淀为模板。用户只做两个决定：选哪套
模板、用什么字母标识项目；其余由生成器完成。

## 两套模板对比

| | server-cli-web | server-cli-web-ts |
| --- | --- | --- |
| 语言 | JavaScript（.js / .jsx） | TypeScript（.ts / .tsx） |
| 类型安全 | 运行时 + 装载期自检 | 额外的**编译期**检查 |
| 适合 | 快速脚本型工具、不想接触类型 | 长期维护、希望编译器提前暴露问题 |

TS 模板的编译期检查包括：action 的 ctx 由声明精确派生（漏传参数、flag 类型写错
即红）、模块 / action / CLI / HTTP 重复注册检查、typed client（未知 action、
漏传参数即红，返回数据精确推导）、branded 路径类型、错误码穷尽映射。

两套模板生成的项目结构一致：core（基础设施）、modules（功能域）、runtime
（装配）、web（React 壳），一条 action 声明同时派生 CLI、HTTP 与 help。

## 使用背景与需求

典型用户：

- 想做一个 npx 可分发的本机工具，希望人和 agent 都能操作
- 已经有 CLI，想补 Web 面板，但不想重写业务逻辑
- 团队里反复起同类项目，需要统一、可验证的起点

## 完整使用流程

```bash
# 1. 看有哪些模板
npx nx-nx template list

# 2. 看模板的可选项（TS 模板示例）
npx nx-nx template describe server-cli-web-ts

# 3. 检查输出目录
npx nx-nx template check-dir --dir D:\proj\my-xx

# 4. 生成（letters 决定项目名，如 xx → nx-xx）
npx nx-nx template create server-cli-web-ts --letters xx --dir D:\proj\my-xx

# 5. 装依赖并跑完整闸门
cd D:\proj\my-xx
pnpm install
pnpm test

# 6. 日常使用 / 开发
pnpm start          # 构建后起面板
pnpm dev            # 开发模式（后端 tsx + 前端 Vite 热更）
```

可视化方式：`npx nx-nx serve` 打开 nx-nx 自己的面板，三栏完成模板选择、
表单填写与 logo 预览，点击生成。

## 使用场景

- 生成本机管理器 / 面板类工具（CRUD + 状态存储 + 面板）
- 生成给 agent 用的工具：生成的项目自带 skill，`xxx skill install` 后
  agent 即可学会操作
- 作为同类新项目的统一基线：测试闸门、分层 lint、发版流水线全部预置

## 生成后的项目里有什么

- 唯一可执行入口 `bin/<letters>.mjs`
- `serve` 命令同时驱动 CLI 与 Web 面板；`routes` 给出命令 ↔ 接口对照
- 示例功能域（TS 模板为 home：bootstrap / routes / health / greet）
- 状态存储 `~/<项目名>/store.json`，环境变量可覆盖
- GitHub Actions：CI（每次 push 校验）+ 发布（push main 自动发 npm）
- smoke 与 unit 测试开箱即绿
