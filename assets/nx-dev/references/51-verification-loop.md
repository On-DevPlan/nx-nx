# 51 · 验证闭环与技术栈调研

> 新模板只有完成「生成 → 安装 → 构建/测试」真实闭环才算交付。本文规定验证
> 路径、目录与端口约定，并给出「总结 X 模板脚手架」时的调研清单。

## 1. 验证用的 CLI（开发地址，两种形式）

```bash
cd <nx-nx 检出目录>

# 免构建（迭代首选）
node --import tsx src/runtime/cli.ts template list --json
node --import tsx src/runtime/cli.ts template describe <id> --json
# 必填项因模板而异（letters / name / lang），以 describe 的输出为准
node --import tsx src/runtime/cli.ts template preview <id> --<必填项> <值> --json
node --import tsx src/runtime/cli.ts template create <id> --<必填项> <值> --dir <案例目录> --json

# 发布形态（最终确认）
pnpm build
node bin/nx-nx.mjs template create <id> --<必填项> <值> --dir <案例目录>
```

验收点：

- `template list` 返回里新模板不在错误清单中
- `describe` 的选项与默认值符合预期
- `preview` 文件清单与 files/ 树一致（占位路径已渲染）
- `create` 返回 nextSteps；目标目录得到完整文件树

## 2. 案例目录约定

- 案例一律放**仓库外**，与源码隔离，例如 `D:\a_js\js_proj\_e2e\<案例名>`
- 目标目录非空即拒：每次案例验证用新目录，或先清空
- 案例目录不入库、不提交；验证后保留与否问用户，不擅自删除
- 非 Node 栈（Go / Java 等）同样适用：案例目录里跑该栈自己的构建/测试

## 3. 端口家族约定

- 每个新模板选一个**独立的端口家族起点**，写进 hooks.mjs 常量与注释，
  避免不同模板生成的项目互相撞端口
- 已占用段：7800 / 7866 / 7880（nx-nx 自身 7880）；TS 模板家族从 7920 起
- 端口不要写死在 template.json（那是过期数据）：用 hooks 的 options 探测
  建议值、beforeGenerate 兜底
- 选新家族时先扫一眼本机已监听端口与已有模板的起点

## 4. 生成案例的验证闸门

Node/server-cli-web 类模板：

```bash
cd <案例目录>
pnpm install
pnpm test            # lint（含分层 / max-lines / max-file-chars）→ typecheck → build → smoke → unit
pnpm start           # 起面板，抽查关键 API 与页面
```

其他技术栈用该栈等价闸门，并至少验证：

- 依赖 / 构建工具能正常拉取与构建
- 入口程序可运行（CLI 或服务）
- 测试命令通过；示例功能端到端可用
- 版本 / help / 健康检查类命令输出正常

## 5. 回归 nx-nx 自身

新模板若只新增目录，不影响生成器；若动了 `src/core` 或共享配置，必须：

```bash
cd <nx-nx 检出目录>
pnpm test            # lint → typecheck → build → smoke → unit（当前 unit 23 项）
npm pack --dry-run   # 确认新模板随包、文件数与体积合理
```

## 6. 「总结 X 模板脚手架」调研清单

收到 `/nx-dev 总结 <栈> 模板脚手架` 时，先调研再动手，至少摸清：

1. **构建/包管理工具**：官方推荐方式（maven/gradle、go module、vite/cargo…），
   初始化命令与标准目录布局
2. **入口与启动方式**：主类 / main 包 / 启动脚本；run 命令；常驻服务还是一次性命令
3. **最小可运行文件集**：哪些文件缺一不可（pom.xml、go.mod、配置文件…），
   哪些是可选增强
4. **测试约定**：官方测试目录与命令（mvn test、go test…），最小测试样例
5. **配置与资源**：配置文件位置、静态资源目录、环境变量约定
6. **命名与坐标**：groupId/artifactId、module 名、包名/命名空间规则——
   映射成模板变量（注意都要能作为单段安全名）
7. **版本基线**：LTS / 主流版本号，写进默认变量

### 栈示例备忘

- **GoFrame（Go）**：`go mod init`、GF 工程目录惯例（cmd/internal/packed/
  manifest/config）、`gf run` / `go run`、配置 yaml；产物是二进制，
  afterGenerate 或 files 内不依赖 Node 运行时
- **Java Maven**：`pom.xml` 为核心，`src/main/java/<包路径>/`、
  `src/test/java/`、resources 目录；`mvn package` 出 jar、`mvn test`；
  包名（com.example.xx）要映射成目录层级，变量设计需保证路径段合法

非 Node 栈的 hooks.mjs 仍由 Node 版 nx-nx 执行（探测端口等），但生成出的
项目本身不依赖 Node——不要把 Node 脚本强加给 Go/Java 项目。

## 7. 高频静默失效点

| 失效 | 后果 | 谁来发现 |
| --- | --- | --- |
| 新模板 id 与目录名不一致 | list 进错误清单，用户看不到 | 开发地址 list |
| files 引用未声明变量 | 生成到该文件才抛错 | preview / 全文件生成 |
| 端口写死且已被占用 | 生成项目起不来 | 案例验证启动步骤 |
| 变量可含路径分隔符 / `..` | 生成器拒绝或路径错乱 | 案例验证 + 生成器路径闸 |
| 改了 core 没跑 nx-nx 闸门 | 发布版带回归 | pnpm test / CI |
| 把栈特逻辑写进 core | 其他模板被迫拖依赖 | 评审；core 分层 lint |
| 只验证 --dry-run | 落盘/二进制问题漏掉 | 必须真实生成并运行 |
