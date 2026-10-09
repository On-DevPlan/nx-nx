// 模板钩子：生成器在「解析选项时」与「生成前」调用。
//
// 契约（见 nx-nx 的 core/template-hooks.ts）：默认导出
// { options?(ctx), beforeGenerate?(vars, ctx), afterGenerate?(targetDir, vars, ctx) }，
// 三者皆可选、可 async。ctx 提供 probePort / probePorts。
//
// 这个模板只做两件事，都不需要 afterGenerate（本模板没有二进制产物要现算）：
//   1. 解析期：把探测到的空闲端口作为建议值填进表单
//   2. 生成前：把用户留空的「派生型」选项补齐（goModule / pgDatabase / 端口）
//
// 为什么派生不写在 template.json 的 default 里：default 是**字面量**，
// 写 {{name}} 只会原样出现在文件里（渲染只有一遍）。派生必须走钩子。

// 端口家族：与 server-cli-web（7881+）/ server-cli-web-ts（7920+）区分开，
// 这两个是 Web 应用的习惯端口段。
const API_PORT_START = 8000;
const WEB_PORT_START = 8080;

export default {
  async options(ctx) {
    const [apiPort] = await ctx.probePorts({ start: API_PORT_START, count: 1 });
    const [webPort] = await ctx.probePorts({ start: WEB_PORT_START, count: 1 });
    return [
      { name: 'apiPort', default: apiPort, hint: `已探测空闲端口 ${apiPort}（Go API 用）` },
      { name: 'webPort', default: webPort, hint: `已探测空闲端口 ${webPort}（nginx 用）` },
      { name: 'pgPort', hint: '不探测：本机已有 PostgreSQL 时你应该连它' },
    ];
  },

  // 生成前补齐。注意这里**不能**在注释或字符串里写出双花括号占位符以外的形态——
  // 本文件不参与渲染，但 files/ 下的文件参与，见各文件的说明。
  async beforeGenerate(vars, ctx) {
    const name = String(vars.name || '').trim();
    const patch = {};

    if (!vars.goModule) {
      patch.goModule = `github.com/example/${name}`;
    }
    if (!vars.pgDatabase) {
      // PG 标识符不接受连字符，换成下划线
      patch.pgDatabase = name.replace(/-/g, '_');
    }
    if (!vars.apiPort) {
      const [p] = await ctx.probePorts({ start: API_PORT_START, count: 1 });
      patch.apiPort = p;
    }
    if (!vars.webPort) {
      const [p] = await ctx.probePorts({ start: WEB_PORT_START, count: 1 });
      patch.webPort = p;
    }
    return patch;
  },
};
