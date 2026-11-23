// ESLint 扁平配置。
//
// 这里主要管的不是代码风格（那个交给约定与编辑器），而是**分层约束**：
// 把「谁可以依赖谁」写成机器可检查的规则。架构意图一旦只写在文档里，
// 就会随提交次数慢慢衰减；写成 lint 规则则会当场拦下。
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'templates/**',
      'src/web/frontend/public/**',
      'coverage/**',
      // temp/ 是运行期的手工作坊（e2e 脚本、浏览器验收 profile、截图），
      // 里面的东西只求能跑，不该被 lint 当成产品代码审。
      'temp/**',
    ],
  },

  // TS / TSX：typescript-eslint 推荐规则集
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      // 文件行数上限：防止单文件持续膨胀。跳过空行与注释，统计的是有效代码行；
      // 上限 600；接近时优先按职责拆分（schema / 文本渲染 / 执行逻辑）。
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 非空断言在本项目里与品牌类型/校验成对出现，不全局禁用
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 函数式 builder 里空函数体等场景
      '@typescript-eslint/no-empty-function': 'off',
      // 显式 any 仅警告——实验期类型边界处需要逃生舱
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // 纯 JS（bin / scripts / tests）：基础规则
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      eqeqeq: ['error', 'smart'],
      // 与 TS 块一致的文件行数上限
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      // zod 的导入形态统一：值用 `import { z } from 'zod'`，类型用 `import type { z, ZodType } from 'zod'`。
      // 命名空间导入（import * as z）拿不到 zod 的类型推导，且各文件写法不一致时很难搜。
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportNamespaceSpecifier[source.value='zod']",
          message:
            "zod 一律用 `import { z } from 'zod'`（只要类型时用 `import type { z, ZodType } from 'zod'`）。",
        },
      ],
    },
  },

  // ---- 分层约束（对应「依赖只能向下 core ← modules ← runtime」）----

  {
    // core 是最底层：零业务语义的基础设施。它一旦依赖上层，分层就塌了。
    files: ['src/core/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../modules/**', '../runtime/**', '../web/**'],
              message: 'core 是最底层，不得依赖 modules / runtime / web。',
            },
          ],
        },
      ],
    },
  },

  {
    // 通用块：业务模块之间禁止互相依赖。
    //
    // 枚举式 + 一致性测试（tests/unit/lint-enumeration.test.mjs）：新增模块忘补
    // 清单时测试直接红，把「静默失效」变成「响亮失效」。
    //
    // system 不在此列：它是聚合器（bootstrap 要一次拿齐各模块状态）。
    files: [
      'src/modules/template/**/*.{ts,tsx}',
      'src/modules/scaffold/**/*.{ts,tsx}',
      'src/modules/skill/**/*.{ts,tsx}',
      'src/modules/script/**/*.{ts,tsx}',
      'src/modules/service-group/**/*.{ts,tsx}',
      'src/modules/git/**/*.{ts,tsx}',
    ],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../template/*', '../template/**',
                '../scaffold/*', '../scaffold/**',
                '../skill/*', '../skill/**',
                '../script/*', '../script/**',
                '../service-group/*', '../service-group/**',
                '../git/*', '../git/**',
                '../system/*', '../system/**',
              ],
              allowTypeImports: true,
              message:
                '模块之间不得做值依赖；共享逻辑请下沉到 core/（类型引用允许 import type）。',
            },
          ],
        },
      ],
    },
  },
  {
    // 后端模块：不得出现视图、不得依赖前端、不得引入 UI 库。
    //
    // 这条约束的价值：前端代码一旦躺在 src/modules/ 下，就会顺手 import ../../core/xxx
    // 与 ../../runtime/xxx 的**值**，把 node 侧代码拖进浏览器包；反过来后端又会
    // import 前端组件，形成环。「视图归前端」这条规矩一旦破，坏得很快也很难查。
    //
    // 配套的硬保证在 tests/unit/layering.test.mjs：src/modules 下不允许出现
    // .tsx/.jsx 文件（lint 只能拦住「引了 react」，拦不住「一个纯 tsx 文件」）。
    files: ['src/modules/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'antd', '@ant-design/icons', 'lucide-react'],
              message: '后端模块不得引入 UI 库——视图归 src/web/frontend/ 管。',
            },
            {
              group: ['**/web/frontend/**', '../web/**', '../../web/**'],
              message: '后端模块不得依赖前端——依赖只能向下（core ← modules ← runtime）。',
            },
          ],
        },
      ],
    },
  },
  {
    // system 是聚合器：允许引用业务模块的 service（只读聚合，不反向写入）。
    // 新业务模块记得在上方通用块补枚举（一致性测试盯着）。
    files: ['src/modules/system/**/*.ts'],
    rules: {},
  },

  {
    // 前端（含 src/web/frontend 下的页面）：这条规则价值最高——
    // 把 Node 侧代码值导入视图，Vite 会把 node: 内置模块一起打进浏览器包。
    //
    // 关键：Node 侧的**类型**导入是允许的（typed client 的类型由注册表推出），
    // 因此用 allowTypeImports 放行；node:* 内置连类型一起禁。
    files: ['src/web/frontend/**/*.{ts,tsx}', 'src/modules/scaffold/**/*.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: '前端不能引用 Node 内置模块。',
            },
            {
              group: [
                '**/modules/*/index.ts',
                '**/modules/*/service.ts',
                '**/runtime/**/*.ts',
                '**/core/**/*.ts',
              ],
              allowTypeImports: true,
              message:
                '前端只能以 import type 引用 Node 侧（index/service/runtime/core）；' +
                '值导入会把 node: 内置模块一起打进浏览器包。',
            },
          ],
        },
      ],
    },
  },
);
