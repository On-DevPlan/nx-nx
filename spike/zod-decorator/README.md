# spike：zod + 装饰器的 action 模型（验证用）

> 目的：验证任务 #2 的第二个要求——「zod 加装饰器到 action 上，同时生成树的 cli 和
> 给前端使用的 apiclient」，并对四条断言给出可执行证据：
> CLI 完全自动化 / 前端 apiclient 半自动化 / 注解方式 / 只维护保留 TS 版本。
>
> 完整评估见 `plan/2026-11-10-zod-装饰器模型验证.md`。本文件是「怎么跑」与「结论摘要」。

## 跑法

```bash
pnpm add -D zod                       # 仓库根已加（devDependency）
node --import tsx spike/zod-decorator/scripts/demo.mts        # 手动看一遍
node --import tsx spike/zod-decorator/scripts/generate.mts    # 重新生成两份生成物
node --import tsx --test spike/zod-decorator/test.mjs         # 29 条断言
npx tsc --noEmit -p spike/zod-decorator/tsconfig.json        # 类型层
npx eslint spike                                            # 风格闸门
```

## 目录

```
spike/zod-decorator/
├── src/action.ts        @action 装饰器 + 元数据收集（WeakMap，不依赖 Symbol.metadata）
├── src/schema.ts        zod schema ↔ CLI/HTTP 形态的桥（字段描述 + 归一化 + 校验）
├── src/registry.ts      类 → action 列表 + 装载期自检
├── src/tree.ts          CLI 树构建 / 最长匹配 / help 渲染
├── src/cli.ts           树驱动的 CLI（零手写命令表）
├── src/codegen.ts       生成 cli-tree.json + 前端 client
├── src/demo/schemas.ts  demo 的 zod schema（纯 zod，浏览器安全，前端可复用）
├── src/demo/module.ts   用装饰器声明的 demo 模块
├── src/demo/server.ts   HTTP 侧（与 CLI 侧共用同一份 schema）
├── src/demo/transport.ts 手写的传输层（「半自动化」里手写的那一半）
├── src/demo/frontend.ts  手写的交互层（按钮 → action → 状态）
├── generated/           生成物：cli-tree.json / client.generated.ts
├── scripts/generate.mts 重新生成两份生成物
├── scripts/demo.mts     手动跑一遍模型（命令树 / CLI 派发 / 非法输入）
├── test.mjs             29 条断言
└── tsconfig.json        spike 自己的类型层配置（仓库根的 tsconfig 不含它）
```

## 结论摘要（详见主报告）

| 断言 | 结论 | 证据 |
| --- | --- | --- |
| CLI 完全自动化 | ✅ 成立 | 树 / help / 解析 / 派发全部派生；测试断言 `cli.ts` 里不出现任何命令名字面量 |
| 前端 apiclient 半自动化 | ✅ 成立，且「半」可量化 | 每条 action 的调用代码 0 手写；手写的是传输层（45 行/项目，只写一次）+ 页面接线（约 10 行 / 页面里用到的每个 action） |
| 注解方式 | ⚠️ 可用但有代价 | TC39 标准装饰器在本机可用；代价是 handler 入参类型要手写 `z.output<typeof schema>`，且编译期检查退化为运行期检查 |
| 只维护保留 TS 版 | ✅ 成立 | 模型的核心收益（schema → 类型）只在 TS 存在；JS 版拿不到 `z.input` / `z.output` |

**四条要记住的坑**（都在代码注释里钉着）：

1. `z.coerce.boolean()` 把 `'false'` 变成 `true`、`z.coerce.number()` 把 `''` 变成 `0`——
   两个都与既有 CLI 语义冲突，必须自己写归一化（`src/schema.ts`）。
2. HTTP **query 参数也是字符串**，「HTTP 是原生类型」只对 body 成立；两端都要过归一化。
3. 装饰器元数据不能靠 `context.metadata`（本机 Node 22 没有 `Symbol.metadata`，tsc 编译后会静默丢失）。
4. handler 的入参类型是 `z.output`（解析后），前端 client 的入参是 `z.input`（调用方提供）——混用会得到「默认值字段可空」的错类型。
