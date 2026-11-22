---
name: A03-service-scaffold
description: 用 CLI 从零生成完整 servicegroup 的 SOP：写五份脚本、用 --contentFile 导入、绑定配置、验证起停与 client。让 AI 自动生成服务套件或扩展脚本时照做。
---

# A03 · 用 CLI 生成完整 servicegroup

只讲动作。不要向用户解释服务组是什么；直接产出文件、导入、验证。

## 触发

- 「把某个服务/工具做成 servicegroup」
- 「自动生成完整服务套件 / 服务脚本 / 扩展脚本」
- 「用 nx-nx 管理一个外部 CLI 的启动和接口验证」

## 固定产物

一个 servicegroup 必须有五个脚本，缺一不可：

| 脚本名 | 作用 |
| --- | --- |
| `<id>-server.mjs` | 长驻入口，负责拉起目标服务并保持进程存活 |
| `<id>-stop.mjs` | 本服务的关停方式 |
| `<id>-health.mjs` | 探活：退出码 0=活，末行 JSON 提供 detail |
| `<id>.shared.mjs` | 常量 / 接口清单 / 断言函数 / 起飞闸门 |
| `<id>-client.mjs` | 验证脚本；后续每个新接口复制一份 |

## SOP

1. **定参数**：确定 `<id>`、端口 `PORT`、目标 CLI 路径 `CLI`、工作目录 `CWD`、隔离数据目录 `HOME`。端口必须避开已有实例；目标 CLI 自带面板时要换端口 + 换数据目录。
2. **在工作区生成五个 `.mjs` 文件**：照抄 `assets/examples/nx-kv-servicegroup/` 的五份脚本，只改目标 CLI、端口、接口清单与断言。
   - server：用 `spawn` 起长驻进程，`stdio: 'inherit'`，把 `SIGTERM/SIGINT` 转给子进程。
   - stop：按端口找监听进程并终止；auto 模式仍保留端口 / pid 兜底。
   - health：请求真实健康接口，校验业务字段，不只验 TCP 通。
   - shared：放 `BASE_URL`、接口清单、断言函数、`checkUp`。
   - client：逐接口调用共享断言；失败写 `process.exitCode = 1`。
3. **用 CLI 写配置**（不要直接编辑 `~/.nx-nx/service-groups.json`）：

   ```bash
   nx-nx sg set <id> --config '<config.json 内容>'
   ```

   配置必须写全 `main / stop / probe / health / shared / clients / launch.entries`；`launch.entries[0].env` 放目标 CLI 与隔离数据目录。

4. **用 CLI 导入五份脚本**（多行全文必须走 `--contentFile`，不要拼 shell 字符串）：

   ```bash
   nx-nx sg script <id> --op create --name <id>-server  --contentFile <dir>/server.mjs
   nx-nx sg script <id> --op create --name <id>-stop    --contentFile <dir>/stop.mjs
   nx-nx sg script <id> --op create --name <id>-health  --contentFile <dir>/health.mjs
   nx-nx sg script <id> --op create --name <id>.shared  --contentFile <dir>/shared.mjs
   nx-nx sg script <id> --op create --name <id>-client  --contentFile <dir>/client.mjs
   ```

   已存在的脚本把 `create` 换成 `save`。

5. **按顺序验证**：

   ```bash
   nx-nx sg show <id> --json
   nx-nx sg start <id>
   nx-nx sg check <id>
   nx-nx sg run <id>
   nx-nx sg stop <id>
   ```

   `sg run` 只跑 client，不负责启动和停止；如果 client 失败，先 `sg check` 再查日志。

6. **扩展脚本**：复制 `<id>-client.mjs` 为新文件，改断言；用 `sg script ... --op create --contentFile` 导入；再用 `sg set` 把新名字追加进 `clients`。不要改 server / stop / health。

## 已验证案例：nx-kv 面板

`assets/examples/nx-kv-servicegroup/` 是完整可照抄底座：

- 启动：`nx-kv serve --no-open --port 7878`，`NX_KV_HOME` 指到独立目录，避开默认 7877 实例。
- 停止：脚本按端口终止进程，`stopMode=auto` 兜底。
- 探活：`GET /api/health`，要求 `ok=true && data.status='ok'`。
- client 验证：`/api/ping`、`/api/health`、`/api/bootstrap`、`/api/contract`、`/api/localtasks`。
- 配置模板：`assets/examples/nx-kv-servicegroup/config.json`，照本机路径改完直接传给 `sg set`。

命令与排障用 [[A02-service]]。
