---
name: nx-nx
description: 当用户要「用 nx-nx 生成一个 CLI + Web 面板项目」「列出/预览/创建项目模板」「生成后装依赖、跑测试、起面板」「跑内置脚本（带内置全局函数的 .mjs）」「用 QuickJS 沙箱跑短脚本」「起一个长驻服务并做活性自愈」「写 client 请求脚本 / 留全量请求日志」「用共享函数面板管理 token 与 API 封装」时使用。触发词：生成项目、脚手架、模板、template、server-cli-web、mono-gf、std-a-lang、初始化、pnpm test、内置脚本、script run、js sandbox、短脚本、服务组、sg、长驻服务、活性检测、自愈、共享面板、shared、send 请求、一请求一日志。不适用：纯 Web 应用、多用户远程部署。
---

# nx-nx

> 随包分发的**使用者 skill**：只讲怎么用；怎么造模板看 `nx-dev`。
> 本文件只做 ref-map——场景 SOP 全在 `references/`，主文档不堆细节。

一句话：从内置模板一键物化「CLI + Web 面板」项目；另提供一次性脚本、短脚本沙箱、长驻服务组三类运行能力。

## 序列总览（先读这里）

| 代号 | 类别 | 成员 |
| --- | --- | --- |
| **A** | 使用 SOP（已有能力怎么跑） | A01 脚本（长 / 短 / 共享面板） · A02 服务组（探活 / 自愈 / 流水线 / 空间） |
| **B** | 生成 SOP（项目怎么造） | B01 模板（选型 / 预览 / 生成） · B02 初始化（装依赖 / 测试 / 起面板） |

## 场景路由（ref-map）

| 场景 | 信号 | 何时读取 | 代号 | 路径 |
| --- | --- | --- | --- | --- |
| 写 / 跑 / 改一次性脚本 | `script list`、`script run`、`.mjs`、`@param` | 动手写脚本或运行前 | A01 | `references/A01-script.md` |
| 跑短脚本 / 沙箱 / 变量堆 | `js sandbox`、`.short`、`js runs` | 纯计算、验算、看变量堆 | A01 | `references/A01-script.md` |
| 起长驻服务 / 探活 / 自愈 | `sg`、`main`、`health`、`autoheal`、`stop` | 建组、排查失活或关停 | A02 | `references/A02-service.md` |
| client 流水线 / 共享面板 / 空间 | `sg run`、`clients`、`shared`、`space.check` | 写业务请求、配闸门 | A02 | `references/A02-service.md` |
| 选模板 / 看选项 / 预览 / 生成 | `template list`、`describe`、`preview`、`create` | 生成项目第一步 | B01 | `references/B01-template.md` |
| 生成后装依赖 / 跑测试 / 起面板 | `pnpm install`、`pnpm test`、`pnpm dev`、`pnpm start` | 项目刚生成或初始化失败 | B02 | `references/B02-init.md` |

## 主流程骨架

```bash
# 生成一个项目：摸底 → 看选项 → 预览 → 生成（细节见 B01，装依赖见 B02）
nx-nx template list
nx-nx template describe server-cli-web
nx-nx template create server-cli-web --letters xx --dir D:\proj\my-xx

# 一次性脚本 / 短脚本（细节见 A01）
nx-nx script list
nx-nx script run <脚本名> -- <参数>
nx-nx js sandbox --code 'set("sum", [1,2,3].reduce((a,b)=>a+b,0))'

# 长驻服务（细节见 A02）
nx-nx sg init ping-demo
nx-nx sg run ping-demo
nx-nx sg stop ping-demo
```

所有命令都可加 `--json` 拿机器可读输出；`--store` 覆盖本次存储路径。

## 硬约束（先看这几条）

- 目标目录**非空即拒**，绝不覆盖；重新生成换新目录。
- 必填项因模板而异：`server-cli-web` 是 `letters`，`mono-gf` 是 `name`，`std-a-lang` 是 `lang`；先 `describe`。
- 服务组 `main` 必须是**长驻**脚本；一次性的事用 `script run`，否则会被判失活并反复重启。
- `.shared.mjs` 不能作入口运行——它只被 `import` 或服务组自动装载。
- 自愈 watcher 只活在 `nx-nx serve` 进程里；没开 serve 时只能手动 `sg start` / `sg stop`。
- 生成项目的端口在**创建时**探测并写进生成物；换端口要重新生成或同步改对应配置。

## 边界

- 生成的是**本机单用户工具**：状态落本机文件，不做多用户 / 远程部署。
- 纯 Web 应用或纯一次性脚本不需要这套骨架时，不用 nx-nx。
