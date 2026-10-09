// skill:pre-install 的 module handler（经 hooks.json 注册）。
//
// 校验安装 cwd 是否为 nx-nx 仓库根：
//   不是 → 返回 { block }，总线据此拒绝安装（不写任何文件）；
//   是   → 返回 { vars: { NX_NX_ROOT } }，把仓库全路径渲染进 SKILL.md。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function isNxNxRoot(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return pkg.name === 'nx-nx' && existsSync(join(dir, 'src', 'runtime', 'cli.ts'));
  } catch {
    return false;
  }
}

export default async function checkRoot(payload) {
  const root = payload.cwd;
  if (!isNxNxRoot(root)) {
    return {
      block: [
        `nx-dev 只能在 nx-nx 仓库检出根目录内安装，当前目录不是 nx-nx：${root}`,
        '判定条件：package.json 的 name 为 "nx-nx"，且存在 src/runtime/cli.ts。',
        '请先 cd 到 nx-nx 检出根目录，再重新执行 skill install nx-dev。',
      ].join('\n'),
    };
  }
  // 统一正斜杠形式：Windows 下 node 与 git 均接受，文档里也更稳定。
  return { vars: { NX_NX_ROOT: root.replace(/\\/g, '/') } };
}
