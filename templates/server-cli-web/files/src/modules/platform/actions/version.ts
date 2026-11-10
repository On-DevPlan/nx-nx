// version —— 显示版本。
//
// render 让 `{{name}} version` 输出裸版本号（脚本里可 `V=$({{name}} version)`），
// 而 `--json` 仍走序列化，保持机器可读。
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { action } from '../../../runtime/action-decorator.js';
import { ActionBase } from '../../../runtime/action-base.js';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

const versionInput = z.object({});

export class VersionAction extends ActionBase {
  @action({
    id: 'version',
    cli: ['version'],
    summary: '显示版本',
    input: versionInput,
    render: (v) => v,
  })
  version() {
    return VERSION;
  }
}
