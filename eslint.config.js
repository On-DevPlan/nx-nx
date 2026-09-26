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
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } }, // .jsx 与 .js 里的 JSX（视图层）
    },
    rules: {
      ...BASE_RULES,
      // JSX 里 <App /> 这种「使用」不被裸 espree 记账（没有 JSX 作用域分析），
      // 组件 import 会被误报 unused。约定：**组件名一律大写开头**（React 官方惯例），
      // 大写开头的 import 不参与 unused 检查。误伤面：只在确实想 import 一个
      // 大写命名却不用时静默——React 生态里这种写法本身就是反模式。
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
      }],
    },
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
    // 通用块：业务模块之间禁止互相依赖。
    //
    // ⚠️ 为什么是「枚举 + 一致性测试」而不是否定式 glob：
    // 试过 gitignore 式白名单（`['../*/**', '!../core/**']`），
    // eslint 9 实测负模式对 `../` 相对路径**全部失效**（同 group / 独立条目
    // / 字符串 allow 都试过）——白名单写不进去，否定式就只剩「全禁」。
    // 退回枚举式，但配一致性测试（tests/unit/lint-enumeration.test.mjs）
    // 断言「枚举清单 == 实际业务模块目录」：新增模块忘补清单时测试直接红，
    // 把脚手架 skill 说的「静默失效」变成「响亮失效」。
    //
    // system 不在此列：它是聚合器（bootstrap 要一次拿齐各模块状态），
    // 单独一块规则管理（见下）。
    files: [
      'src/modules/template/**/*.{js,jsx}',
      'src/modules/scaffold/**/*.{js,jsx}',
      'src/modules/home/**/*.{js,jsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../template/*', '../template/**', '../scaffold/*', '../system/*', '../system/**'],
              message: '模块之间不得互相依赖；共享逻辑请下沉到 core/。',
            },
          ],
        },
      ],
    },
  },
  {
    // system 是聚合器：bootstrap 要一次拿齐各模块状态，允许引用业务模块的
    // service（只读聚合，不反向写入）。它**没有**额外的 import 限制——
    // 通用块不覆盖 system，聚合是它存在的意义。
    // 新业务模块记得在上方通用块的 files/group 里各补一行（一致性测试盯着）。
    files: ['src/modules/system/**/*.{js,jsx}'],
    rules: {},
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
