// help —— 显示帮助（可跟模块名或命令组，如 {{name}} help home）。
//
// 走标准 action 形态：--json 时 emit 会序列化返回的条目，
// 于是 `help --json` 输出的是可解析的命令表而非帮助文本。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';
import { commandEntry, helpEntries, renderHelp, type CommandEntry } from '../../../runtime/help.js';

const helpInput = z.object({
  topic: z.string().optional(),
});

export class HelpAction extends ActionBase {
  @action({
    id: 'help',
    cli: ['help'],
    summary: '显示帮助（可跟模块名或命令组，如 {{name}} help home）',
    // topic 是**位置参数**（`help home`）：zod 通道里位置性由 args 声明，
    // 漏写就会变成「多余的参数」。
    args: ['topic'],
    input: helpInput,
    render: (entries, ctx) => renderHelp(entries as CommandEntry[], (ctx as { topic?: string } | undefined)?.topic),
  })
  async help(ctx: z.output<typeof helpInput>): Promise<CommandEntry[]> {
    // 动态 import cli：registry 静态依赖本模块，静态引入 CliApp 会形成循环。
    const { cliApp } = await import('../../../runtime/cli.js');
    return helpEntries(ctx.topic, cliApp.commands.map(commandEntry));
  }
}
