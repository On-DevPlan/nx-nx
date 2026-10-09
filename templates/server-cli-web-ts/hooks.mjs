// 模板钩子：生成器在「解析选项时」与「生成前」调用。
//
// 为什么需要钩子：模板的某些选项值域依赖**运行环境**——比如可用端口。
// 写死在 template.json 里只能是过期数据。
//
// 契约：默认导出 { options?, beforeGenerate?, afterGenerate? }，三者皆为可选、可 async。
// 本模板没有二进制产物要现算，因此不实现 afterGenerate。

// 家族端口起点：避开 7800/7866/7880 等已占用段
const PORT_START = 7920;

export default {
  // 解析期：给「端口」这类选项补上探测出的建议值，
  // 面板据此把默认值填进输入框，CLI 用户则看到 hint。
  async options(ctx) {
    const [port, vitePort] = await ctx.probePorts({ start: PORT_START, count: 2 });
    return [
      {
        name: 'port',
        default: port,
        hint: `已探测空闲端口 ${port}（serve 用）`,
      },
      {
        name: 'vitePort',
        default: vitePort,
        hint: `已探测空闲端口 ${vitePort}（vite dev 用）`,
      },
    ];
  },

  // 生成前：端口没填就补一个可用的。
  // 放在这一步而不是 options 里，是因为用户可能显式清空端口要求「随便给一个」。
  async beforeGenerate(vars, ctx) {
    // PROJECT_ROOT 是「skill 安装期」占位（安装时由 hooks.json 的 handler
    // 注入项目根路径）。生成期把它渲染成字面 {{PROJECT_ROOT}} 保留下来。
    const patch = { PROJECT_ROOT: '{{PROJECT_ROOT}}' };
    if (!vars.port) {
      const [p] = await ctx.probePorts({ start: PORT_START, count: 1 });
      patch.port = p;
    }
    if (!vars.vitePort) {
      const [v] = await ctx.probePorts({ start: PORT_START + 10, count: 1 });
      patch.vitePort = v;
    }
    return patch;
  },
};
