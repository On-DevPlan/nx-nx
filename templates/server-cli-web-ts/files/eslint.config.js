// ESLint 扁平配置。
//
// 这里主要管的不是代码风格（那个交给约定与编辑器），而是**分层约束**：
// 把「谁可以依赖谁」写成机器可检查的规则。架构意图一旦只写在文档里，
// 就会随提交次数慢慢衰减；写成 lint 规则则会当场拦下。
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/web/frontend/public/**'],
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
      // 新增代码前先看看目标文件是否已逼近上限，超限应先拆分文件。
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 非空断言在本项目里与品牌类型/校验成对出现，不全局禁用
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 函数式 builder 里空函数体等场景
      '@typescript-eslint/no-empty-function': 'off',
      // 显式 any 仅警告——类型边界处保留逃生舱
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
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
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
    // 业务模块：模块之间禁止互相值依赖（本骨架只有 home 一个模块，
    // 新增模块时把它的路径补进 group，并同步更新一致性测试）。
    files: ['src/modules/home/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../home/*', '../home/**'],
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
    // 前端（含 modules/home 下的视图 tsx）：这条规则价值最高——
    // 把 Node 侧代码值导入视图，Vite 会把 node: 内置模块一起打进浏览器包。
    //
    // 关键：Node 侧的**类型**导入是允许的（typed client 的类型由注册表推出），
    // 因此用 allowTypeImports 放行；node:* 内置连类型一起禁。
    files: ['src/web/frontend/**/*.{ts,tsx}', 'src/modules/home/**/*.tsx'],
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
