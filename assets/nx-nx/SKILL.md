---
name: nx-nx
description: 当用户要「用 nx-nx 生成一个 CLI + Web 面板项目」「列出/预览/创建项目模板」「起一个本机脚手架项目」时使用。触发词：生成项目、脚手架、模板、create、template、server-cli-web、起项目、npx nx-nx、CLI 加面板。不适用：纯 Web 应用、纯一次性脚本、多用户远程部署。
---

# nx-nx

> 本 skill 面向**使用者**（客户 / agent），随包分发：`nx-nx skill install` 一步装好。
> 只讲「解决什么问题、怎么用」；源码结构与如何新增模板属于开发 skill `nx-dev`。

一句话：nx-nx 是项目生成器——从内置模板（JavaScript / TypeScript 两套 server-cli-web
骨架）一键物化一个开箱可用的「CLI + Web 面板」项目。

## 解决什么问题

起一个「既有命令行、又有浏览器面板」的本机工具，传统做法要手工铺 CLI 解析、HTTP
路由、前端壳、构建链、发版流水线，几十处配置还容易漏。nx-nx 把这套已经在多个项目
上验证过的骨架做成模板：选模板、给 1~5 个字母作为项目标识，一条命令得到完整项目，
生成后直接 `pnpm install && pnpm test` 即绿。

## 命令速查

| 命令 | 说明 |
| --- | --- |
| `nx-nx template list` | 列出可用模板（agent 摸底从这里开始） |
| `nx-nx template describe <id>` | 查看模板说明与可选项 |
| `nx-nx template preview <id> --letters ab` | 预览将生成的文件清单（不写盘） |
| `nx-nx template create <id> --letters ab [--dir D]` | 按模板生成项目 |
| `nx-nx template ports [--start N] [--count N]` | 探测空闲本机端口 |
| `nx-nx template check-dir --dir D` | 检查输出目录是否可用（非空即不可用） |
| `nx-nx serve [--port N] [--no-open]` | 启动 nx-nx 自己的 Web 面板（可视化创建） |
| `nx-nx routes` | CLI 命令 ↔ HTTP 路由对照表 |
| `nx-nx health` | 自检 |
| `nx-nx skill install [name] [--group G] [--to D]` | 安装随包 skill |
| `nx-nx skill list` | 列出可装的 skill 与 group |
| 任何命令 + `--json` | 机器可读输出（agent 模式） |

模板 id：`server-cli-web`（JavaScript）、`server-cli-web-ts`（TypeScript，带编译期
类型安全）。

## agent 典型会话

1. `nx-nx template list --json` —— 拿到模板列表
2. `nx-nx template describe server-cli-web-ts --json` —— 确认可选项
3. `nx-nx template check-dir --dir D:\proj\my-xx --json` —— 确认目标目录可用
4. `nx-nx template create server-cli-web-ts --letters xx --dir D:\proj\my-xx --json`
   —— 生成；读返回的 nextSteps
5. 进入生成目录：`pnpm install`，然后 `pnpm test`（lint / typecheck / build / smoke / unit）
6. `pnpm start` 起面板，或 `pnpm dev` 开发模式

出错时读 `error` 字段：带「用法:」前缀 = 参数问题，改参数重试；`NOT_FOUND` =
模板 / 路径不存在；目录非空被拒 = 换空目录或新路径。

## 关键约束（避免踩坑）

- 目标目录**非空即拒**，绝不覆盖——要重新生成就换新目录或清空目录
- `--letters` 必须是 1~5 位小写字母；它与模板 namePrefix 拼出项目名（如 `nx-xx`）
- 生成项目的端口由模板钩子在创建时探测并写死，面板与 Vite 各一个
- 生成的是**本机单用户工具**：状态存 `~/<项目名>/store.json`

## 什么时候不用

- 需要多用户 / 远程部署（生成的是本机工具）
- 纯 Web 应用或纯一次性脚本（不需要 CLI ↔ 面板同源骨架）

## references

- `00-product.md` —— 解决什么问题 / 使用背景 / 两套模板对比 / 完整使用流程
