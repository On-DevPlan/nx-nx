// ESLint 扁平配置。
//
// 这里主要管的不是代码风格（那个交给约定与编辑器），而是**分层约束**：
// 把「谁可以依赖谁」写成机器可检查的规则。架构意图一旦只写在文档里，
// 就会随提交次数慢慢衰减；写成 lint 规则则会当场拦下。
import tseslint from 'typescript-eslint';

// 单文件字符数闸门。
//
// 与下面的 max-lines 是同一件事的两把尺子：行数管「结构」，字符数管「密度」。
// 只看行数时，把每行拉长就能继续膨胀；只看字符数时，密集短行又会被误伤。
// 两者都按「有效代码」计（跳过空行与注释），阈值 15000 对当前最大文件
// （scripts/link-local.mjs，约 12.7k 有效字符）留出余量：再翻一倍就该拆了。
//
// ESLint 没有内置的「单文件字符数」规则，这里用一份内联插件补上，
// 免得为一个阈值去引第三方插件或额外文件。
const FILE_SIZE = {
  rules: {
    'max-file-chars': {
      meta: {
        type: 'suggestion',
        docs: { description: '单个文件的有效字符数上限，防止文件体积膨胀' },
        schema: [
          {
            type: 'object',
            properties: { max: { type: 'integer', minimum: 1 } },
            additionalProperties: false,
          },
        ],
      },
      create(context) {
        const max = (context.options[0] && context.options[0].max) || 15000;
        return {
          Program(node) {
            const source = context.sourceCode || context.getSourceCode();
            let text = source.getText();
            // 注释区间整段剔除：比正则可靠，不会误伤字符串里的 `//`
            for (const comment of [...source.getAllComments()].reverse()) {
              text = text.slice(0, comment.range[0]) + text.slice(comment.range[1]);
            }
            const count = text.replace(/\s/g, '').length;
            if (count > max) {
              // 消息用字符串拼接，**不要**用 ESLint 的 messages/messageId 插值：
              // 那套语法是「双花括号 + 变量名」，而本文件是模板文件，模板引擎
              // 同样把双花括号当生成变量，生成项目时直接报「未声明的变量」。
              // 连这段注释里都不能出现双花括号，否则生成期一样会红。
              context.report({
                node,
                message: `单文件有效字符数 ${count} 超过上限 ${max}，请按职责拆分文件。`,
              });
            }
          },
        };
      },
    },
  },
};

// 内联插件（单文件字符数闸门）。
const LOCAL_RULES = { rules: { ...FILE_SIZE.rules } };

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
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
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
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // 字符数闸门：覆盖所有被 lint 的文件，不给任何目录开豁免 ——
  // 体积上限是产品约束，不是「代码 / 非代码」的区分。
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],
    plugins: { local: LOCAL_RULES },
    rules: { 'local/max-file-chars': ['error', { max: 15000 }] },
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
              group: [
                '../modules/**', '../runtime/**', '../web/**',
                '../../modules/**', '../../runtime/**', '../../web/**',
              ],
              message: 'core 是最底层，不得依赖 modules / runtime / web。',
            },
          ],
        },
      ],
    },
  },

  // 业务模块之间禁止互相值依赖 —— 这条**故意不写在这里**。
  //
  // 用 no-restricted-imports 表达它必须逐模块枚举路径，而漏补一条就静默失效；
  // 更糟的是新增模块时得同步改这份配置，等于「加一个模块要改全局文件」。
  // 判定这件事需要**解析真实路径**（`../home/x` 与 `../../core/x` 在字符串层面
  // 长得太像），那是 lint 规则不擅长、而测试很擅长的活：
  // 见 tests/unit/layering.test.mjs —— 它扫 src/modules 下所有 import 并解析落点，
  // 新模块零配置，也不会随枚举过期。

  {
    // 浏览器侧的边界：src/web/ 以下**只准跑在浏览器里**。
    //
    // 这条规则是**目录级**的，不枚举具体页面/模块——新建 pages/<页>/ 自动被覆盖，
    // 不需要动这份配置。旧版按 src/modules/{home,skill}/** 逐个枚举，
    // 漏补一处那条约束就形同虚设（当时还专门写了一条测试盯「你补了枚举没」）。
    files: ['src/web/**/*.{ts,tsx}'],
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
              group: ['**/modules/**', '**/runtime/**', '**/core/**'],
              allowTypeImports: true,
              message:
                '前端只能以 import type 引用 Node 侧（modules / runtime / core）；' +
                '值导入会把 node: 内置模块一起打进浏览器包。',
            },
          ],
        },
      ],
    },
  },
);
