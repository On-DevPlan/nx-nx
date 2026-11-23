# A04 · git 模块（企业级 git 工作流 · 交互式 + 直连）

> 这是一篇 **SOP**：给 AI 执行的固定动作链，不是概念介绍。
> 每个操作「什么时候用」写在菜单与 `nx-nx git operations` 里——三个迁移操作尤其容易混，
> 动手前先按下面的表对号入座。

## 0. 两种入口

| 入口 | 用法 | 什么时候 |
| --- | --- | --- |
| **交互式** | `nx-nx git i` | 参数多、要挑（选分支 / 选文件 / 挑 commit） |
| **直连** | `nx-nx git <操作> --参数` | 参数已知，或要写进脚本 / CI |

两条入口**跑同一份实现**（`src/modules/git/ops/`），所以行为一致。
非 TTY 环境（管道 / CI / `--json`）下 `git i` 自动降级为**只读快照**，不抢终端。

## 1. 选操作：先对号入座

| 你要做的事 | 操作 | 命令 |
| --- | --- | --- |
| 先看仓库现在什么状态 | status | `nx-nx git status` |
| 开特性分支，开发分支与 PR 分支分开 | prfeat | `nx-nx git prfeat --name <名字>` |
| 别的分支里有要的提交，拿一个过来 | cherry-pick | `nx-nx git cherry-pick --source <分支> --commit <hash>` |
| merge / rebase 冲突了，回到操作之前 | abort | `nx-nx git abort` |
| 冲突文件不多，批量选一边 | resolve-conflicts | `nx-nx git resolve-conflicts --strategy ours --all` |
| 改动**还没提交**，搬到别的分支继续写 | migrate-workspace | `nx-nx git migrate-workspace --branch <分支>` |
| 目标分支**已经有内容**，别让源分支覆盖它 | migrate-with-memory | `nx-nx git migrate-with-memory --new-branch <新> --base <源> --reference <目标>` |
| AI 提交了一串 commit，抽到 feat 分支，主分支历史保持干净 | extract-commits | `nx-nx git extract-commits --name <名字>` |
| 仓库混进了 docx/mp4/exe 这类大文件，从历史里抹掉（**危险**） | purge-files | `nx-nx git purge-files --pattern '<正则>'` |
| 抹掉历史内容但保留提交形状（**危险**） | cleanup-history | `nx-nx git cleanup-history` |
| 本地分支改名并覆盖远端同名分支（**危险**） | force-push | `nx-nx git force-push --local <本地> --remote <远端>` |

### 三个「迁移」的区别（最容易混）

- `migrate-workspace` 搬的是**工作区**（未提交的改动）。
  目标分支已存在且分叉时，改动以「未提交」形态落地。
- `migrate-with-memory` 从 **merge-base**（共同祖先）建新分支 ——
  目标分支已有的内容天然保留，再按目标分支的文件清单过滤暂存区，不覆盖它。
- `extract-commits` 搬的是**已提交的 commit** —— 抽到 `feat-<名字>` 保留原始历史，
  主分支 squash 成 1 个 commit。**AI 提交一串时用这个。**

## 1.1 purge-files：从历史里抹掉大文件

删掉工作区那一份 docx 没用——它还留在历史里（每个 commit 各存一份 blob），仓库体积下不来。

```bash
# 第 1 步：只扫描。列出快照里匹配正则的文件与体积，历史一个字都不动
nx-nx git purge-files --pattern '\.(docx|mp4|exe)$'

# 第 2 步：真删。选中文件后重写历史——危险操作，必须显式 --force
nx-nx git purge-files --pattern '\.(docx|mp4|exe)$' --files 'demo.docx,clip.mp4' --force --push
```

交互式（`nx-nx git i` → 选「从历史里清除文件」）的动作链：

```
填快照 commit（默认 HEAD）→ 填正则 → 看清单（文件 + 体积）→ 勾选要清除的文件
→ 重写范围（默认「所有分支与标签」）→ 三个开关 → 敲 PURGE-HISTORY 确认 → 执行
```

- **重写范围按「文件的创建点」算**，不是按 HEAD：文件是很久以前加进来的，
  只重写 HEAD 那一个提交等于没删。
- **改名链自动展开**：文件改过名时（`a/x.docx` → `b/x.docx`），旧路径也一起清——
  否则同一个 blob 还挂在老路径下，照样能下到。
- **默认连 tag 一起重写**（`--scope all`）：文件常常还挂在老 tag 的树里，
  只改当前分支的话，从 `raw/<tag>/<路径>` 照样能下到。`--scope branch` 只改当前分支。
- 提交标题 / 作者 / 时间不变，只有 hash 会变；其它文件与提交原样保留。
- 因清除文件而变空的提交会被剪掉（`--keep-empty` 可保留）。
- 目标文件在工作区那份也一起消失；`--gc`（默认开）才真正释放磁盘空间。
- 重写完会**逐个 ref 复查**（所有分支与标签的树），确认没有 ref 还挂着目标文件。
- 直连 CLI 不带 `--force` 就只列清单、不动历史。

⚠️ 强推后 GitHub 仍会保留「分支上一版顶端」一小段时间，按旧 SHA 直取仍可能下到文件；
彻底清除要联系 GitHub Support 清缓存视图，或等 GitHub 自然 GC。

## 2. 交互模式的动作链

```
nx-nx git i
  → 选操作（分组搜索列表；打字过滤、↑↓ 移动、回车选中）
  → 逐项补参数
      · 能从仓库现状推导的 → 自动采用，并告诉你采用了什么
      · 只有一个选项的     → 自动选中
      · 需要人拍板的       → 才问你（选分支 / 选文件 / 挑 commit）
  → 确认页（「即将执行」+ 等价 CLI 命令 + 风险文档）
  → 执行（spinner + 分步日志 + 结果）
```

危险操作在确认页必须**原样敲出确认文字**：
`cleanup-history` → `我了解风险，确认清理`；`force-push` → `FORCE-PUSH`；
`purge-files` → `PURGE-HISTORY`。

## 3. 交互式的标准做法（AI 代跑时）

```bash
# 1) 先看状态，确定当前分支、有没有进行中的操作、有没有冲突
nx-nx git status

# 2) 需要挑参数时，让用户在交互模式里选；参数已知就直接直连
nx-nx git i extract-commits

# 3) 执行完复查
nx-nx git status
```

**不要**替用户猜「选哪个分支 / 选哪些文件 / 挑哪个 commit」——这三类参数就该让用户在
交互菜单里挑。非交互环境（脚本 / CI）则必须显式给全参数。

## 4. 事务安全契约（不可绕过）

| 场景 | 行为 |
| --- | --- |
| 有冲突时 `abort` | **拒绝自动中止**，先打印「GIT 操作中止指南」；`--yes` 也不行，必须 `--force` |
| 混合冲突类型（UU + DD 同时存在） | `resolve-conflicts` **拒绝统一策略**，只给类型说明文档，不动文件 |
| `cleanup-history` | 执行前强制备份 `.git`；每阶段失败都把备份路径带出来 |
| `purge-files` | 同款 `.git` 备份；工作区不干净 / 有冲突 / 有进行中操作 → 拒绝重写；直连必须 `--force` |
| `force-push` | 先把本地目的分支备份成 `<branch>-bak-HHMMSS` |

恢复 `.git` 备份（POSIX / Windows 两条都给）：

```bash
cd <仓库根>
rm -rf .git && cp -R <备份目录> .git                     # POSIX
Remove-Item -Recurse -Force .git; Copy-Item -Recurse <备份目录> .git   # PowerShell
```

## 5. 排障

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `git i` 打印了一份清单而不是菜单 | 不是真 TTY（管道 / CI / `--json`） | 直接用直连命令；或在真终端里跑 |
| `abort` 拒绝执行 | 有冲突，或状态重叠 | 看它打印的中止指南；确认后加 `--force` |
| `resolve-conflicts` 拒绝执行 | 多种冲突类型混合 | 按提示逐个文件手动处理 |
| `migrate-workspace` 报 pathspec 错误 | 目标分支名有特殊字符 | 用合法的分支名（字母数字与 `- _ . /`） |
| `extract-commits` 报工作区不干净 | 有未提交改动 | 先提交或 stash |
| `purge-files` 只列清单不动历史 | 没给 `--files`，或没给 `--force` | 先看清单挑文件；确认后加 `--force` |
| `purge-files` 报「找不到创建提交」 | 选中的路径本来就不在历史里 | 核对 `--files` 里的路径 |
| `--files` 里的路径含逗号 | `--files` 用逗号分隔，路径本身带逗号会被切开 | 用交互式勾选，或改用不含逗号的路径 |
