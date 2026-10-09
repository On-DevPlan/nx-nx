---
name: nx-dev
description: 当用户要「给 nx-nx 开发新模板」「把某个技术栈总结成 nx-nx 模板」「在 templates/ 下新增模板并验证」时使用。触发词：/nx-dev、新模板、开发 nx-nx、总结脚手架、goframe 模板、javamaven 模板、maven 骨架、新增 template。不适用：仅使用 nx-nx 生成项目（用主 skill nx-nx）、修改生成器之外的无关项目。
---

# nx-dev — nx-nx 模板开发 skill

> 本 skill 面向**在 nx-nx 仓库里开发新模板的 agent**。与主 skill `nx-nx` 的分工：
> 主 skill 讲「怎么用生成器」；本 skill 讲「怎么给生成器造模板并验证」。

## 第一条硬规则：所有 CLI 调用走开发地址

nx-nx 是「生成器自己也是 nx 系列项目」的特殊仓库。开发模板时**禁止**使用全局安装或
npx 拉到的发布版——那不含你正在写的模板，还会污染验证结论。始终在仓库检出目录内
调用本地 CLI，两种形式：

```bash
# 仓库根（安装时由 preInstall 钩子注入全路径，固定为下面这个值）
cd {{NX_NX_ROOT}}

# 形式 A：免构建，tsx 直接跑 TypeScript 源码（改完即跑，开发首选）
node --import tsx src/runtime/cli.ts <命令...>

# 形式 B：先构建再跑（验证发布形态时用）
pnpm build
node bin/nx-nx.mjs <命令...>
```

判断自己是否在开发地址：目录下同时存在 `src/runtime/cli.ts`、`templates/`，
且 `package.json` 的 name 为 `nx-nx`。本 skill 安装时已由通用 hook 总线的
`skill:pre-install` 事件（配置见本目录 hooks.json，handler 见 install/）
校验过这一点——非 nx-nx 目录执行 install 会被拒绝；路径以注入的
`{{NX_NX_ROOT}}` 为准，不要自行猜测或换用发布版。

## 第二条硬规则：新栈 = 新模板目录，不改既有模板

- 新技术栈一律新建 `templates/<新 id>/`，**不要**为了复用去改
  `server-cli-web` / `server-cli-web-ts`——它们是已发布的稳定基线
- 模板 id 用小写、连字符，且与 `template.json` 的 id 逐字一致
- 通用生成器（src/core）不认识任何具体技术栈；栈特有逻辑全部放进模板的
  `hooks.mjs` 与 `files/`

## /nx-dev 工作流（用户用法）

用户典型说法：

- `/nx-dev 总结 goframe 模板脚手架`
- `/nx-dev 总结 javamaven 的模板脚手架`

「总结 X 模板脚手架」= 四步闭环：

1. **调研**：摸清该技术栈的官方/事实标准项目布局——构建工具、入口、目录约定、
   run/test 命令、最小可运行文件集（见 51 的调研清单）
2. **造模板**：按 `templates/<id>/` 契约写 template.json、hooks.mjs、files/
   （契约全文见 `50-template-authoring.md`）
3. **案例验证**：用开发地址 CLI 把新模板物化成一个真实项目，装依赖并跑通该栈
   的构建与测试（流程见 `51-verification-loop.md`）
4. **回归与交付**：跑 nx-nx 自身闸门确认没有碰坏共享代码；汇报模板路径、
   生成案例路径与验证结果

## 边界与禁忌

- 生成器**永远不认识「图片」等二进制概念**：模板需要二进制产物时，在
  `afterGenerate` 钩子里自己产出；通用层只按扩展名做文本替换 / 二进制复制
- 模板变量值会进路径，含 `..` / 盘符 / 绝对段会被生成器当场拒绝——设计变量
  时就按单段安全名约束
- 不提交 `dist/`、`node_modules/`、生成案例目录（案例放仓库外）
- 没跑过的验证不算验证：每个新模板至少完成一次「生成 → 安装 → 构建/测试」
  真实闭环

## references

- `50-template-authoring.md` —— 模板契约：template.json schema、hooks 三钩子、
  files 占位与文本/二进制规则、派生变量、作者自检清单
- `51-verification-loop.md` —— 验证闭环：开发地址命令、e2e 目录约定、端口家族、
  生成项目闸门、技术栈调研清单（goframe / java-maven 等）、高频静默失效点
