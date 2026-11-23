// system 域的共用辅助函数：open 目标归一与 HTTP 查询解析。
//
// 单独成文件的原因：system.open 的 action 与单测都要用它们，而 index.ts
// 现在只做装配（actions 清单由脚本生成），不放实现。
import { badInput } from '../../core/errors/index.js';

// 「open 目标」归一：三种形态都收——纯端口（可带路径）、host:port、完整 URL。
// port 仅当目标确属本机（localhost / 127.0.0.1 / [::1]）才返回，供探针判断
// 服务在不在；外部地址探测没有意义，probePort 只会给出误导性答案。
export function normalizeOpenTarget(input: unknown): { url: string; port: number | null } {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw badInput('open 需要一个目标：端口（7822）、host:port（localhost:7822）或完整 URL');
  }
  // 纯端口先行截住：直接拼 scheme 的话，http://7822 会被 URL 解析成主机名 7822
  const bare = /^(\d{1,5})(\/.*)?$/.exec(raw);
  if (bare) {
    const port = Number(bare[1]);
    if (port < 1 || port > 65535) {
      throw badInput(`端口越界（1~65535）: ${bare[1]}`);
    }
    return { url: `http://localhost:${port}${bare[2] || ''}`, port };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  // 数字主机名要在解析前拦：URL 解析器会把「7822」当 IPv4 数值地址规范化成
  // 0.0.30.142，解析后就认不出来了。典型误写 "7822:80"——用户想要的是本机端口。
  const authority = withScheme.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0]!;
  const withAuth = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  const hostOnly = withAuth.startsWith('[') ? withAuth.slice(0, withAuth.indexOf(']') + 1) : withAuth.split(':')[0]!;
  if (/^\d+$/.test(hostOnly)) {
    throw badInput(`「${raw}」会解析成数字主机名。想开本机端口直接写端口就行: nx-nx open ${hostOnly}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw badInput(`打不开这个目标: ${input}（试 7822 / localhost:7822 / https://…）`);
  }
  const port = parsed.port ? Number(parsed.port) : null;
  if (port !== null && (port < 1 || port > 65535)) {
    throw badInput(`端口越界（1~65535）: ${parsed.port}`);
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  return { url: parsed.href, port: isLocal ? port : null };
}

// 供其他模块复用的解析工具（system 是唯一允许被跨模块引用的例外之一）
export function parseHttpQuery(input: unknown): { method: string | null; path: string } {
  const s = String(input || '').trim();
  const m = /^([A-Za-z]+)\s+(.*)$/.exec(s);
  const method = m ? m[1]!.toUpperCase() : null;
  const path = (m ? m[2]! : s).split('?')[0]!;
  if (!path.startsWith('/')) {
    throw badInput(`HTTP 查询需形如 "/api/x" 或 "POST /api/x"，收到: ${input}`);
  }
  return { method, path };
}
