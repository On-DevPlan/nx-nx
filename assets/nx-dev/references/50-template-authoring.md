# 50 · 模板作者契约

> 本文是 `templates/<id>/` 的完整契约，内容与 nx-nx 的 `src/core` 实现一一对应。
> 改契约前先核对源码：`core/templates.ts`（元数据与变量）、`core/generate.ts`
> （渲染落盘）、`core/template-hooks.ts`（钩子）。

## 1. 目录布局

```
templates/<id>/
├─ template.json   # 元数据 + 静态选项 schema（必需）
├─ hooks.mjs       # 动态选项 / 生成前后钩子（可选）
└─ files/          # 模板文件树（必需）；路径与内容里可用 {{var}} 占位
```

- 目录名即模板 id；`template.json` 必须重复声明同一个 id（不一致即坏模板）
- `files/` 之外的文件不会被生成；`template.json` 自身不进生成结果
- 遍历时自动跳过：`.git`、`node_modules`、`.DS_Store`、`template.json`、
  `*.log`、`*.tmp`

## 2. template.json schema

```json
{
  "id": "<与目录名一致>",
  "name": "<展示名，必需>",
  "description": "<一句话说明，list/describe 展示>",
  "namePrefix": "nx-",
  "nextSteps": ["生成后展示的步骤，可用 {{name}} 等占位"],
  "options": [ { "name": "letters", "type": "letters", "required": true } ]
}
```

### option 对象字段

| 字段 | 说明 |
| --- | --- |
| `name` | 选项名（即变量名），必需 |
| `type` | `string`（默认）/ `number` / `boolean` / `enum` / `letters` |
| `label` | 表单标签 |
| `required` | 必填；缺失时在变量解析阶段报错 |
| `default` | 默认值；未填且无默认时，布尔为 false，其余为空串（留给钩子补） |
| `values` | type=enum 时的可选值数组（enum 缺 values 即坏模板） |
| `hint` | 输入提示 / describe 展示 |

非法 type、enum 缺 values、选项缺 name 都会让模板在 list 时进入错误清单
（不影响其他模板）。

### 派生变量（模板不用自己拼）

存在 `namePrefix` 且有 `letters` 选项时，生成器自动派生：

- `name` = namePrefix + letters（如 `nx-xx`）
- `title` = name
- `envPrefix` = name 大写、连字符转下划线（如 `NX_XX`）

若派生出的 name 与模板 id 相同会被拒（避免项目与模板同名）。
`letters` 的合法值：1~5 位小写字母。

## 3. hooks.mjs 契约

默认导出对象，三个钩子全部可选、都可 async：

```js
export default {
  // 解析期：返回动态选项，按 name 合并进静态声明（同名以动态为准）
  async options(ctx) { return [ { name: 'port', default: 7920 } ]; },

  // 生成前：补齐/校验变量；返回补丁对象合并进 vars；抛错中止生成
  async beforeGenerate(vars, ctx) { return { port: vars.port || 7920 }; },

  // 生成后：产出模板专属二进制产物（logo 等）；通用层不认识这些概念
  async afterGenerate(targetDir, vars, ctx) { /* ... */ },
};
```

### HookCtx 工具箱（钩子的第一个参数 ctx）

- `probePort(port): Promise<boolean>` —— 端口是否空闲
- `probePorts({ start?, count? }): Promise<number[]>` —— 连续探测空闲端口
- `cwd?` —— 调用方工作目录

模板作者**不要**从 nx-nx 内部 import 任何模块——需要的能力都由 ctx 给，
否则模板会与生成器内部路径耦合。

没有 hooks.mjs 的模板一切按静态声明运行；hooks.mjs 必须默认导出对象，
否则加载报错。

## 4. files/ 与占位规则

### 占位符

- 语法：`{{var}}`，路径段和文件内容都支持（如 `bin/{{letters}}.mjs`）
- 变量来自选项解析 + 派生变量；**内容里引用未声明变量会抛错**（严格渲染）
- 例外：GitHub Actions 的 `${{ ... }}` 不是双花括号，不受影响，可直接写
- 元数据（description / nextSteps / hint）走**宽松渲染**：未声明变量原样保留，
  以便 list 阶段（还没有 vars）也能展示

### 文本 vs 二进制

- 走 `{{var}}` 替换的文本扩展名：`.js .mjs .cjs .jsx .ts .tsx .json .md
  .txt .css .html .yml .yaml .toml .ini .cfg .sh`，以及 `.gitignore .npmrc
  .editorconfig`、无扩展名文件
- 其余（图片、字体、ico、png 等）按二进制**原样复制**，不做任何替换
- 判断还会看内容：含 NUL 字节的不按文本处理

### 路径安全（生成器已内置，作者需知晓）

渲染后的每个路径段若含 `..`、`.`、盘符，或解析后越出目标目录，当场拒绝
（即使规范化后仍在目录内）。因此模板变量不要设计成可含路径分隔符或回溯段。

## 5. 作者自检清单

- [ ] 目录名 = template.json 的 id；`name` 已填
- [ ] 必需选项齐全；enum 有 values；动态值（端口等）交给钩子而非写死
- [ ] files/ 内每个占位变量都能由 options + 派生 + 钩子提供
- [ ] 需要二进制产物时走 afterGenerate，没往 core 里加栈特概念
- [ ] 开发地址 CLI 验证：`template list` 无错误、`describe` 正常、
      `preview` 文件清单符合预期
- [ ] 完成一次真实生成并跑通构建/测试（见 51）
- [ ] 新模板在 `templates/` 下独立成目录，未改动既有模板
