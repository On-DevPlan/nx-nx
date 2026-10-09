# 52 · 通用 hook 总线契约（配置驱动 / match / 无限事件平面）

> 本文是 nx-nx 内 hook 机制的标准契约，与 `src/core/hook-bus.ts`、
> `src/core/hook-handlers.ts` 一一对应。新增任何 hook 能力都走本契约，
> 不要再写「一个钩子一个接口」的专用代码。

## 模型来源

参考 Claude Code 的 hooks 模型：

```
事件（PreToolUse / PostToolUse / Stop ...）   ← 开放事件平面
  └─ 规则 { matcher: 正则, hooks: [...] }      ← 按目标过滤
       └─ handler { type, command/use }        ← 进程/模块隔离，统一协议
```

在 nx-nx 落地为每个 skill（或项目目录）可自带的 `hooks.json`。

## hooks.json 形状

```json
{
  "version": 1,
  "hooks": {
    "<任意事件名>": [
      {
        "match": "<正则字符串，匹配 target>",
        "hooks": [
          { "type": "module", "use": "./handlers/x.mjs" },
          { "type": "module", "use": "./handlers/x.mjs#namedExport" },
          { "type": "command", "command": "node ./y.mjs", "timeoutMs": 10000 }
        ]
      }
    ]
  }
}
```

字段约定：

| 字段 | 含义 |
|---|---|
| `hooks.<event>` | 事件名是**开放字符串**，核心不枚举；新事件无需改总线 |
| `match` | 正则；只在 `target` 命中时执行该规则（等价 Claude Code 的 matcher） |
| `hooks[].type` | `module`（默认）或 `command` |
| `use` | module：相对 hooks.json 的路径，可 `#导出` 名，缺省 `default` |
| `command` | command：shell 命令，cwd = hooks.json 所在目录 |
| `timeoutMs` | command 超时，默认 15000 |

## Payload（handler 输入）

module handler 收到一个 JSON 可序列化对象；command handler 经 stdin 收到同一对象：

```json
{
  "event": "skill:pre-install",
  "target": "nx-dev",
  "match": "^nx-dev$",
  "cwd": "/path/to/cwd",
  "...": "事件特有字段，平铺"
}
```

安装事件的特有字段：`skillsDir`、`sourceDir`、`targetDir`、`force`、`vars`。

## Decision（handler 输出）

module：返回对象（或不返回）；command：exit 0 时 stdout 输出 JSON：

```json
{ "block": "拒绝原因（非空即阻断事件）",
  "vars": { "KEY": "值" },
  "data": "任意附带数据" }
```

| decision | 行为 |
|---|---|
| `block` | 立即阻断事件、停止后续 handler；pre-install 场景 = 拒绝安装 |
| `vars` | 合并进动态字符串表，渲染 `{{KEY}}` |
| `data` | 收集进 outcome.data |

command 的退出码约定（对齐 Claude Code）：

| exit | 含义 |
|---|---|
| 0 | 成功；stdout 空 = 继续，stdout JSON = decision |
| 2 | 阻断；stderr 作为 block 原因 |
| 其他 | 执行错误（EXTERNAL） |

## 已注册事件

| 事件 | target | 触发点 |
|---|---|---|
| `skill:pre-install` | skill 名 | 复制前；可拒绝、可产出 vars |
| `skill:post-install` | skill 名 | 复制后 |

事件平面无限：需要新事件（如 `template:pre-generate`、`server:listen`）时，
在配置里直接写事件名并在对应位置调用 `runHookEvent` / `emit` 即可。

## 安装期资产的分发规则

skill 安装时，`hooks.json` 与 `install/` 目录**不复制**进目标——它们是安装期
机制；其余文本文件按 vars 渲染、二进制原样。需要随目标分发的 hook 资产，
放在其他目录（不要占用 `install/` 名）。

## 错误处理（一律显眼，不静默）

- hooks.json 坏 JSON / schema 错 / match 非法正则 → `SPEC_ERROR`
- module 路径越出配置目录、模块不存在、导出不是函数 → `SPEC_ERROR`
- command 超时 / stdout 非 JSON / 非约定退出码 → `EXTERNAL`

## 作者自检清单

- [ ] 事件名语义清晰、target 选择正确（skill 名 / 路径 / 其他）
- [ ] `match` 正则实测过命中与不命中两种情况
- [ ] handler 走通「继续」与「block」两条路径
- [ ] command handler 在 Windows（cmd.exe）与 POSIX 下都能跑
- [ ] 动态字符串占位符与 vars 键逐字一致
- [ ] 安装后目标目录不含 hooks.json / install/
