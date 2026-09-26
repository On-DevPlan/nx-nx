// 模板钩子：生成器在「解析选项时」与「生成完成后」调用。
//
// 为什么需要钩子：模板的某些选项值域依赖**运行环境**——比如可用端口。
// 写死在 template.json 里只能是过期数据。而 logo 这种二进制产物，
// 也该由模板自己产出，不该让通用生成器认识「图片」这个概念。
//
// 契约：默认导出 { options?, beforeGenerate?, afterGenerate? }，三者皆为可选、可 async。
import { join } from 'node:path';
import { generateAll, SCHEMES } from './files/tools/logo-gen/index.mjs';

// 家族端口起点：避开已占用的 7800/7801/7866/7877/7880 等
const PORT_START = 7881;

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
      {
        name: 'scheme',
        hint: `撞色方案，可选: ${Object.keys(SCHEMES).join(' / ')}`,
      },
    ];
  },

  // 生成前：端口没填就补一个可用的。
  // 放在这一步而不是 options 里，是因为用户可能显式清空端口要求「随便给一个」。
  async beforeGenerate(vars, ctx) {
    const patch = {};
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

  // 生成后：产出 logo 全套（svg + png + ico）到面板的静态目录。
  //
  // 刻意**不在模板里预置二进制 logo**：那样每次生成都是同一张图，
  // 而「图与项目名对不上」正是这个家族已经踩过的坑（两个仓库的图标
  // 来自不同批次的生成，肉眼可见不一致）。改成每次现算，从根上消除漂移。
  async afterGenerate(targetDir, vars) {
    return generateAll(
      join(targetDir, 'src', 'web', 'frontend', 'public'),
      vars.letters,
      vars.scheme || 'mars'
    );
  },
};
