// help —— 显示帮助（可跟模块名或命令组，如 {{name}} help home）。
//
// 走标准 action 形态：--json 时 emit 会序列化返回的条目，
// 于是 `help --json` 输出的是可解析的命令表而非帮助文本。
import { z } from 'zod';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase, type ActionInput } from '../../../runtime/action-base.js';
import { commandEntry, helpEntries, renderHelp, type CommandEntry } from '../../../runtime/help.js';

/** help 的入参契约。 */
const input = z.object({
  topic: z.string().optional().describe('模块名或命令组（如 home / skill）'),
});

export class HelpAction extends ActionBase<typeof input> {
  @action({
    id: 'help',
    cli: ['help'],
    http: null,
    summary: '显示帮助（可跟模块名或命令组，如 {{name}} help home）',
    // topic 是**位置参数**（`help home`）：zod 通道里位置性由 args 声明，
    // 漏写就会变成「多余的参数」。
    args: ['topic'],
    input,
    render: (entries, ctx) => renderHelp(entries as CommandEntry[], (ctx as { topic?: string } | undefined)?.topic),
  })
  override async run(ctx: ActionInput<this['_input']>): Promise<CommandEntry[]> {
    // 动态 import cli：registry 静态依赖本模块，静态引入 CliApp 会形成循环。
    const { cliApp } = await import('../../../runtime/cli.js');
    return helpEntries(ctx.topic, cliApp.commands.map(commandEntry));
  }
}
