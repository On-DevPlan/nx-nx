# nx-nx script hub 方案评价（任务 #1：读懂 · 阐述 · ack 返回）

> 评价基准：v0.9.2 工作区（main @ a03fedc），逐文件读过 `src/core/script/*`、
> `src/core/service/*`、`assets/scripts/*`（runner/aliases/lib/demo 五件套）、
> `src/modules/service-group/*`、`assets/nx-nx/SKILL.md` 与现有测试。
> 任务背景里的愿景原文逐条对照见 §4。

## 1. 读懂：方案实际是什么

script hub = **两个域 + 一份契约**：

```
assets/scripts/               ← 真相源：纯 .mjs、零构建、零项目依赖
├─ aliases.mjs                契约层：~48 个内置全局函数，ALIASES 清单=文档=契约
├─ lib/{fs,shell,sys,out,http,service}.mjs   六组原语实现
├─ _runner.mjs                解释器：注入全局 → 装载共享面板 → 堆快照 → 跑目标脚本
├─ <name>.mjs                 入口脚本（可独立执行）
└─ <name>.shared.mjs          共享面板（不可作入口，组绑定自动装载）
        ↑ 子进程（node _runner.mjs <script> [args]）
src/core/script/              Node 侧编排：CRUD/manifest/@param 解析/子进程调用
src/core/service/             sg 域：store(配置+运行态) / check(活性) /
                              runtime(启动/停止/watcher 自愈) / pipeline(流水线)
src/modules/service-group/    index.ts 一处声明 action → CLI+HTTP+Web 三端同源
```

**运行模型**（`runtime.ts` 头注释写得准确）：

- 主脚本 = detached spawn，stdio 追加重定向到 `~/.nx-nx/services/logs/<id>-<时间戳>.log`，unref 后 serve 退出不带它；管理靠 pid 记录 + 端口/HTTP 活性轮询。
- 活性判定刻意宽松：TCP 握手成功即活；HTTP `< 500` 即活（4xx 算活）——「服务本体在响应」与「业务正确」分离，这个口径是对的。
- watcher 活在 serve 进程内（`setInterval` + unref），连续失败达 `failThreshold` → `stopGroup + startGroup`（自愈），事件进 `events-<id>.log`；**serve 不在跑时不自愈**（显式声明的边界，CLI 可手动兜底）。
- 启动幂等三段：pid 活 → skip；health 真实探测通过 → skip（adopt：pid 记录过期但端口活的就是服务本体）；否则真启动。
- 停止三重兜底：关停脚本（spawnSync 15s 超时）→ netstat 找端口 → taskkill pid。
- 流水线 `sg run`：start main → 轮询活性（固定 20s 超时）→ clients 按数组序逐个同步执行，每步落报告。
- 共享面板：`NX_SHARED_PANEL` 环境变量注入路径，runner 在目标脚本之前 `await import()`，然后扫 `globalThis` 新增键输出快照——可 JSON → 240 字符预览；函数 → 签名；其余 → 仅类型名（Map/循环引用不泄内部表示）。
- 脚本内服务控制（`lib/service.mjs`）：`serviceAlive/Check/Start/Stop/Status` 全部走 serve 的 HTTP API——**脚本域不直接碰进程，编排事实源只有 serve 一处**，这个归一很关键。
- 「一请求一日志」：`send()` 全量 req/resp 落 `$NX_HTTP_LOG_DIR/<时间戳>-<METHOD>-<slug>.log`，sg 执行时按组隔离。

## 2. 评价：做对了什么

1. **契约式解耦是真解耦，且有结构性保障**。aliases.mjs 三条硬约束（只依赖 node:、不认识 nx-nx 概念、脚本不许 import 内部模块）写进文件头；`installAliases` 当场校验「清单↔实现」双向一致，`script.test.mjs` 再钉一层。别名清单 = 文档 = 契约，改项目不会连带改脚本——这是整个方案最值钱的一条。
2. **子进程隔离选对了**。不用 vm（ESM import + node: 内置在 vm 里是坑），脚本的全局副作用与崩溃关在自己进程里；`process.argv` 重写让脚本看到的 argv 只有自己，噪声为零。
3. **`@param` 注释静态解析是聪明决定**（params.ts 头注释自述了理由）：参数表要在执行前拿到（画表单），运行时导出必须先跑一遍脚本——那是副作用。选注释就绕开了「为画输入框而起服务」。
4. **幂等启动含 adopt 语义**：health 通过就认领现有服务不重复起，处理了「进程被外部回收 / 记录过期」的真实场景。
5. **宽口径活性判定**（§1 已述）避免了「探测路径没配对就把服务判死→反复重启」的经典误伤。
6. **编排事实源单点化**：脚本侧启停/check 全走 serve HTTP API，没有第二套进程管理实现。watcher 只在 serve 里 → 自愈逻辑也只写了一遍。
7. **CLI/HTTP/Web 三端同源**（defineAction 一处声明），「服务」页表单化配置不碰 JSON（view.tsx 头注释明确「用户不碰 JSON」），且面板自动识别 `!s.shared` 分出入口/面板两组。
8. **演示组自成闭环**：demo-server（写 pid 文件）→ demo-stop（读 pid 关停）→ demo.shared（token/api 封装/随机数据/故意放一个 Map 验证快照清理行为）→ demo-client（先 serviceAlive 再请求）。文档、示例、契约三者互证。

## 3. 评价：缺口与问题（按严重度分级）

### A. 契约/实现不一致（应立即修，成本极低）

| # | 问题 | 位置 |
|---|------|------|
| A1 | **`__tests` 隐藏测试案例「runner 装载后自动运行」从未实现**——`_runner.mjs` 只 dump 快照，没有任何执行 `__tests` 的代码；demo.shared.mjs:8 的注释是虚假契约 | `_runner.mjs` vs `demo.shared.mjs:8,76` |
| A2 | **调试残留**：`serviceGroup.set` 处理器里 `console.error("DBG type=...")`，自 v0.9.0（dc055b4）起每次 set 往 stderr 吐一行 | `src/modules/service-group/index.ts:93` |
| A3 | **ALIASES 清单里 `send` 重复登记两次**（两条描述不同的同名词目）；installAliases 的双向校验检测不出清单内重复 | `assets/scripts/aliases.mjs` 网络组 |
| A4 | runner 快照为空时的提示「数据请挂到 globalThis **或用 export 声明**」是误导——快照只扫 `globalThis` 新增键，面板 `export` 的符号进模块命名空间、**不会**出现在快照里（runner 也没接收 `import()` 返回值去枚举） | `_runner.mjs` dumpSharedPanelSnapshot |

### B. 设计缝隙（愿景已写、实现走样或没走完）

1. **「每个 script 指定包含哪些共享函数」没实现**。共享是**组级 1:1 绑定**（`shared` 字段单值，无数组）。脚本级唯一的等价物是显式 `import './demo.shared.mjs'`（demo-client 这么干）——但这条路**不经过 runner 的装载钩子，不输出堆快照**。于是「每次本 script 的执行都得让共享面板输出一次变量产出日志」这条契约只覆盖 sg 流水线/`--shared` 入口，直接 import 的执行静默无快照。两条装载路径行为不一致，是最值得先收口的设计缝隙。
2. **共享面板可无声覆盖内置别名**。快照只报「新增键」，面板若定义 `readText` 等同名函数，覆盖不可见、无告警。demo.shared 被迫发明 `serviceAlive2` 绕开自己想覆盖的内置 `serviceAlive`——设计在逼用户绕路，说明缺一道「面板键与内置别名冲突 → 拒绝装载或显式告警」的检查。
3. **自愈停服阻塞 serve 事件循环**。`tickWatch` → `stopGroup` → `spawnSync`（关停脚本最长 15s）+ `spawnSync(taskkill/netstat)`，全部同步调用，自愈期间整个 serve（含 Web 面板所有 API）冻结十几秒。
4. **`runtime.json` 读改写无锁**。watcher tick 与 HTTP API（sg start/stop）并发 patchRuntime，原子写防损坏但不防丢更新（后写覆盖先写）。单机低频下概率小，但自愈 + 用户同时点按钮正是会触发的场景。
5. **流水线活性等待固定 20s**（`ALIVE_TIMEOUT_MS`），不可按组配置——java -jar 冷启动很容易超 20s，这正是主脚本「可以调 java -jar」的使用场景。
6. **日志「更友好」愿景未达**：主日志/事件日志/请求日志三套都在落盘，但面板只显示 logFile 路径字符串，无 tail、无按组聚合视图、无轮转清理（日志目录无限增长）。
7. **进程管理 Windows-only**：tasklist/taskkill/netstat + `pidAlive` 检测失败视为存活。Windows-first 没问题，但换机跑会全链路失效，连报错都不是清晰的（tasklist 不存在 → 视为活 → 永不重启）。

### C. 测试缺口（sg 全域零测试）

`script.test.mjs` 钉住了别名一致性、resolveScript、runScript、编辑器安全；但：

- **service-group 域没有任何测试**：normalizeGroup 校验、启停幂等、check 口径、pipeline 步骤、watcher failStreak→自愈，全裸奔；
- 共享面板装载（NX_SHARED_PANEL 注入 → 快照输出 → .shared 拒绝作入口）未钉——恰好是 A1/B1/B2 三个问题所在的地方；
- `@param` 解析（params.ts）未钉。

这套功能全是「起进程、改全局状态」的易碎逻辑，恰恰最需要测试钉住。

### D. 愿景层（namespace / 元编程）——尚未开始

任务背景末段设想的「脚本与服务融合为按 namespace 划分的模块、ns 间导入导出、启动按钮↔ns 管理空间、js 堆栈 hook」：现状完全没有 ns 概念——脚本与组都是扁平名字列表。这是第二阶段的大方向，单独评价见 §5。

## 4. 愿景对照表（任务背景逐条 → 现状）

| 愿景原文要点 | 状态 | 落点 |
|---|---|---|
| 主脚本长驻、IO 定向到日志 | ✅ | `runtime.ts` detached spawn + 追加重定向 |
| 主脚本可执行 node，从而调 java -jar / go run | ✅（能力具备） | 脚本=任意 node 代码，`run()`/`sh()` 原语 |
| 端口占用 / HTTP 基本信息 check 活性 | ✅ | `check.ts`（宽口径判定） |
| 失活处理方案：自愈/重启 | ✅（serve 在跑时） | watcher + onDead:restart，事件留痕 |
| stop：给关闭信号或直接杀端口 | ✅ | 关停脚本 → 杀端口 → 杀 pid 三重兜底 |
| 面板提供返回 bool 的活性函数，执行 server 前先 check | ✅ | `serviceAlive()`（内置别名 + demo.shared 演示标准姿势） |
| client 内置 send（带日志/时间戳） | ✅ | `http.mjs` 一请求一日志 |
| 共享函数面板扩展自定义共享函数（client-base 思想） | ✅ | `.shared.mjs` + demo.shared |
| 单个 script 可单独执行（领域聚合请求） | ✅ | `script run` 任意 .mjs |
| 面板绑定服务组、不可执行、常量=函数={} 整体优先执行 | ✅ | `.shared` 后缀拒绝入口；runner 先装载 |
| 面板里生成 token/随机数据 | ✅ | demo.shared 演示 |
| 执行完成后输出堆上变量信息，清理地址/句柄，只显示可 JSON 确认 | ✅（近似实现） | globalThis 扫描 + 240 字符截断 + 类型降级；**不是真堆快照**（见 §5） |
| 隐藏测试案例（`__tests` 自动运行） | ❌ 写了文档没写实现 | A1 |
| 每个 script 指定包含哪些共享函数；每次执行必输出面板日志 | ⚠️ 半实现 | B1（组级绑定 + 显式 import 两路不一致） |
| 编辑流水线、脚本依次启动（server→client） | ✅ | `sg run` pipeline |
| 更友好的日志功能 | ⚠️ 落盘齐全、消费端弱 | B6（面板无查看器） |
| 元编程/namespace 模块空间、ns 间导入导出 | ❌ 未开始 | §5 |
| 堆栈 hook（js 堆栈级检查） | ❌ 未开始（现状是 globalThis 扫描近似） | §5 |

## 5. 对「namespace / 元编程」方向的意见

现状其实已有半个 namespace 的雏形：`.shared` 后缀约定 + 组级面板绑定，本质是**隐式命名空间**（组 id 就是 ns 名），缺的只是把它显式化：

- 落成**目录/命名约定**（如 `scripts/<ns>/` 或 `<ns>.shared` 多面板按序装载），「启动按钮 ↔ ns 管理空间」就是现在的 `sg run <id>` 换个展示层——不必发明新运行时；
- ns 间导入导出 = 面板之间显式 `import`（ESM 原生支持），只要把「装载顺序」从单面板变多面板有序列表，契约不变；
- **对「js 堆栈 hook / 真堆快照」要克制**：真堆快照只有 V8 inspector 一条路（`inspector.Session` + HeapProfiler），会引入 CDP 会话管理、序列化体积、跨进程协调三层复杂度；而 globalThis 扫描已覆盖「确认共享面板产出了什么」这一实际需求的 ~80%。建议保持廉价近似，把「清理无关地址信息」继续靠「只输出可 JSON 表示」这条规则兜住；
- 「元编程」这个词背后真正想要的，拆开看是：**声明式编排（已有，sg 配置）+ 声明式参数（已有，@param）+ 声明式共享（半成品，B1）+ 可观测（弱，B6）**。把这些收口，比引入新抽象层收益大。

**优先级建议**：先修 A 类四处（契约诚实，半天内）→ 补 B1/B2（统一两条装载路径 + 面板键冲突检查）→ 补 C 类测试把现有行为钉住 → 然后再动 §5 的 ns 显式化。B3（spawnSync 阻塞）在自愈真实触发时会卡面板，值得提前到与 B1 同批。

## 6. 总评

方案内核是对的且执行质量不低：契约式解耦 + 子进程隔离 + 三端同源 + 单点编排事实源，这四个决策互相咬合，没有为「脚本中心主义」牺牲可维护性。愿景中「长驻服务 + 活性自愈 + 共享面板 + 流水线」的主干已全部落地且演示闭环完整。主要债在三处：**契约文档与实现的三处不一致（A1/A3/A4——共享面板这个新概念的说明书在骗人）、sg 全域零测试、脚本级共享函数选择这个明确写了但没做的点**。namespace/元编程是合理的第二阶段，但应当以「把隐式 ns 显式化」的方式渐进到达，而不是另起元编程平台。
