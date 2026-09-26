// ESLint 扁平配置。
//
// 这里主要管的不是代码风格（那个交给约定与编辑器），而是**分层约束**：
// 把「谁可以依赖谁」写成机器可检查的规则。架构意图一旦只写在文档里，
// 就会随提交次数慢慢衰减；写成 lint 规则则会当场拦下。
import { defineConfig } from 'eslint/config';

const BASE_RULES = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-undef': 'off', // 浏览器/Node 全局混用，靠运行时暴露；装 globals 包不值得
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error',
  'no-console': 'off', // CLI 工具，输出就是产品
};

export default defineConfig([
  { ignores: ['src/web/public/**', 'node_modules/**', 'templates/**'] },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: BASE_RULES,
  },

  // ---- 分层约束（对应主文档「依赖只能向下 core ← modules ← runtime」）----

  {
    // core 是最底层：零业务语义的基础设施。它一旦依赖上层，分层就塌了。
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-imports': [
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
    // 模块之间禁止互相依赖，需要共享的下沉到 core/。
    //
    // 用否定式 glob 而非逐模块枚举，这一点值得说明：
    // 其他项目写的是手写列表 `['../repos/*', '../skills/*', ...]`，
    // 新增模块忘了补，它就悄悄变成「谁都可以依赖」，而且没有任何测试会发现
    // ——脚手架 skill 把这条列为「静默失效」的典型（枚举式规则随模块数衰减）。
    //
    // 否定式把默认翻过来：**一切同级目录都禁，白名单显式放行**。
    // 实测语义（必须写成 `../*/**`，只写 `../*` 连白名单也会被拦掉）：
    //   '../*/**'      拦所有兄弟模块，含尚未创建的新模块
    //   '!../core/**'  放行 core
    //   相对路径 './x.js' 不受影响（模块内部文件照常互相引用）
    files: ['src/modules/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/**', '!../core/**'],
              message: '模块之间不得互相依赖；共享逻辑请下沉到 core/。',
            },
          ],
        },
      ],
    },
  },

  {
    // 前端：这条规则的价值最高——把 Node 侧代码 import 进视图，
    // Vite 会把 node: 内置模块一起打进浏览器包，构建期报错或运行期炸掉。
    files: ['src/web/frontend/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: '前端不能引用 Node 内置模块。',
            },
            {
              group: ['**/modules/*/index.js', '**/modules/*/service.js', '**/runtime/**', '**/core/**'],
              message:
                '前端只能 import 模块的 view.jsx。index.js/service.js/runtime/core 是 Node 侧代码，拖进浏览器包会把 node: 内置模块一起带进来。',
            },
          ],
        },
      ],
    },
  },

  // ---- 生成器专属区域：tools/ 要读模板树、写目标目录、spawn 进程 ----
  { files: ['tools/**/*.{js,mjs}'], rules: { 'no-restricted-imports': 'off' } },
]);
