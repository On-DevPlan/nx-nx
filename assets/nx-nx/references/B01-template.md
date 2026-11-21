---
name: B01-template
description: nx-nx 模板选型与生成 SOP——template list / describe / check-dir / preview / create，三套模板的必填项与选项，目录、端口与 letters 规则。选模板或生成项目前读。
---

# B01 · 模板与生成

## 加载时机

- 用户说「生成项目」「起个脚手架」「列出 / 预览模板」「server-cli-web / mono-gf / std-a-lang」
- 主 SKILL.md 路由到「模板」场景

## 1. 三套模板怎么选

| 模板 id | 产出 | 必填 | 适合 |
| --- | --- | --- | --- |
| `server-cli-web` | 可运行的 TypeScript「CLI + Web 面板」项目，编译期类型安全 | `--letters` | 本机工具通用基线；人和 agent 都能操作 |
| `mono-gf` | GoFrame v2 + React 面板 + nginx + PostgreSQL 全栈 mono-repo | `--name` | 标准 Web 应用；多人访问、要落库、docker compose 起服 |
| `std-a-lang` | `a_<lang>/{sdk,proj,res,doc}` 四象限目录骨架，不产出可运行项目 | `--lang` | 给某语言铺工作区；可一次批量多个语言 |

`server-cli-web` 与 `mono-gf` 生成后都能直接跑；`std-a-lang` 只铺目录，后续往里填项目或资源。

## 2. 生成 SOP（五步）

```bash
# 1) 摸底：有哪些模板
nx-nx template list --json

# 2) 看必填项与可选项（不要照抄别的模板的 flag）
nx-nx template describe server-cli-web --json

# 3) 确认输出目录可用（存在且非空即不可用）
nx-nx template check-dir --dir D:\proj\my-xx --json

# 4) 预览文件清单（不写盘）
nx-nx template preview server-cli-web --dir D:\proj\my-xx --letters xx --json

# 5) 生成；读返回的 nextSteps，按 B02 初始化
nx-nx template create server-cli-web --letters xx --dir D:\proj\my-xx --json
```

- `--set k=v,k=v` 可一次传多个选项，等价于逐项 `--k v`。
- `create --dry-run` 只走生成流程不落盘；`preview` 天生不写盘。
- 生成后 `nextSteps` 是模板作者给的真实步骤；优先照它做，再读 [[B02-init]]。

## 3. 选项速查

### server-cli-web

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `letters` | letters（必填） | 1~5 位小写字母；项目名 = `prefix + letters`，同时决定数据目录、bin 名与 logo |
| `prefix` | string | 默认 `nx-`；可改 `my-` 或清空（项目名仅字母）；须匹配 `^[a-z0-9_-]*$` |
| `description` | string | 写进 package.json 与面板副标题 |
| `port` | number | serve 端口；留空自动探测（家族从 7920 起） |
| `vitePort` | number | vite dev 端口；留空自动探测 |
| `scheme` | enum | logo 撞色：`klein` / `mars` / `hermes` / `tiffany` / `red` / `vandyke` / `prussian` |
| `version` | string | 初始版本，默认 `0.1.0` |

### mono-gf

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string（必填） | 项目名；决定目录、Go module 后缀、容器名、库名与环境变量前缀（1~40 位） |
| `goModule` | string | 推荐与 GitHub 仓库一致；留空 `github.com/example/<name>` |
| `apiPort` / `webPort` | number | Go API / nginx 端口；留空自动探测空闲端口 |
| `pgHost` / `pgPort` / `pgDatabase` / `pgUser` / `pgPassword` | 混合 | 数据库参数；`pgPort` 刻意不探测（本机已有 PG 时应该连它） |
| `description` / `initial` / `version` | string | 描述 / 品牌首字母 / 初始版本 |

### std-a-lang

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `lang` | string（必填） | 单语言 `ts`，批量 `ts, go, py`（英文逗号）；`^[a-z][a-z0-9_]{1,8}` 每段 |
| `--dir` | create 参数 | **父目录**，多语言时生成平级 `a_ts/` `a_go/`；须为空目录 |

## 4. 生成规则与坑

- **目标目录非空即拒**，绝不覆盖；重新生成就换新目录或先清空。
- **必填项因模板而异**：`server-cli-web` 是 `letters`，`mono-gf` 是 `name`，`std-a-lang` 是 `lang`；先 `describe` 再拼命令。
- `letters` 只认 1~5 位小写字母；派生出的项目名与模板 id 同名会被拒。
- 端口由模板钩子在**创建时**探测并写进生成物；生成后再改端口要同时改 serve 与 vite 配置。
- `std-a-lang` 是 `outputMode: siblings`：`--dir` 是 `a_<lang>/` 们的父目录，不是某一个 `a_ts/`。
- Web 面板 `nx-nx serve` 走同一条 `template create` 路径（模板卡片 + 表单 + 预览），不是另一套生成器。
- 模板 id 区分大小写；未知 id 会返回可用列表。

## 5. 错误处置

| 现象 | 处置 |
| --- | --- |
| 返回带「用法:」前缀 | 参数问题：按 `describe` 的选项名与类型重拼，别猜 |
| `NOT_FOUND` | 模板 id / 目录不存在；先 `template list` |
| 目录非空被拒 | 换空目录或新路径；不要指望 `--force`（create 没有覆盖语义） |
| 必填项缺失 / 类型错 | `template describe <id>` 看 required 与类型；数字选项别加引号 |
| `letters` 非法 | 1~5 位小写字母，不能数字开头、不能大写 |

## 6. 验收清单

- [ ] `template list` 中目标模板存在且 `describe` 无错误
- [ ] `check-dir` 判定可用
- [ ] `preview` 文件清单符合预期（没有写到磁盘）
- [ ] `create` 后目录结构与 `nextSteps` 一致
- [ ] 按 [[B02-init]] 完成装依赖与测试闸门
