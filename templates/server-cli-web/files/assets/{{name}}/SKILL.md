---
name: <skill-name>
description: 当用户……时使用（症状描述，非流程描述）。触发词：5-10 个主题词/命令动词。不适用：……（反例 1-2 个）。
---

# <项目名>

一句话：这个项目是干什么的、给谁用。

## 核心不变量（违反会怎样）

1. **一条 action 定义，三端同时暴露**——在 `src/modules/<域>/index.js` 里同时声明
   `cli` 路径与 `http` 路由。漏了 http 面板就没有这个操作；漏了 cli 则启动时
   registry 自检直接报错（「Web 操作必须有 CLI 等价」）。
2. **失败抛错，业务结果返回 `{status}`**——冲突/跳过/阻止不是错误，UI 要拿它
   弹窗让用户决策。把冲突写成 throw，上层就只能对错误文案做字符串匹配。
3. **依赖只能向下** `core ← modules ← runtime`——模块之间禁止互相 import
   （eslint 否定式禁列强制，新增模块自动被覆盖）。共享逻辑下沉 `core/`。

## 命令速查

| 命令 | 说明 |
| --- | --- |
| `<app> serve [--port N] [--no-open]` | 启动 Web 面板 |
| `<app> routes` | CLI 命令 ↔ HTTP 路由对照表（agent 摸底从这里开始） |
| `<app> help [topic]` | 帮助；`help --json` 输出可解析命令表 |
| `<app> health` | 自检 |
| 任何命令 + `--json` | 机器可读输出（agent 模式） |
| 任何命令 + `--store <path>` | 本次运行覆盖存储路径（测试防污染必用） |

## agent 典型会话

1. `<app> routes --json` —— 拿到全部命令与路由，选需要的
2. `<app> <命令> --json` —— 执行并取结构化结果
3. 出错时读 `error` 字段：带「用法:」前缀 = 参数问题，改参数重试；
   `NOT_FOUND` = 目标不存在；`CONFLICT`/`BLOCKED` = 业务冲突，停下来问人

## 什么时候不用

- 需要多用户 / 远程部署（这是本机单用户工具）
- 一次性的临时任务（不值得起服务，直接用脚本）

## 数据与存储

- 状态存 `~/.<name>/store.json`，原子写；环境变量 `<ENV_PREFIX>_STORE` 可覆盖路径
- 删除数据 = 删这个文件（无隐藏状态）

## references

- `00-design.md` —— 架构与不变量的完整阐述（改动核心代码前必读）
