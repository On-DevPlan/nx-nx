// spike：HTTP 侧 —— 与 CLI 侧共用同一份 schema，但**归一化规则不一样**。
//
// 这里有一个必须说清的细节：**query string 也是字符串**。
//   - body 是 JSON → number 就是 number、boolean 就是 boolean（原生类型）
//   - query 是 URL 编码 → ?repeat=3 拿到的是 "3"，?loud=false 拿到的是 "false"
// 所以「HTTP 原生类型」只对 body 成立；query 参数要过**同一套**归一化器
// （本 spike 复用 normalizeCliValue，名字该改成 normalizeTextValue 才对）。
//
// 这是「一份 schema 两端用」的代价：两端共用 schema，但两端都要先归一化，
// 只是归一化的输入源不同（argv / query string vs JSON body）。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ActionDef } from '../registry.js';
import { describeInput, normalizeCliValue, parseInput, parseOutput } from '../schema.js';

interface RouteEntry {
  action: ActionDef;
  regex: RegExp;
  keys: string[];
}

function compile(actions: ActionDef[]): RouteEntry[] {
  return actions
    .filter((a) => a.http)
    .map((action) => {
      const pattern = action.http![1];
      const keys: string[] = [];
      const body = pattern
        .split('/')
        .map((seg) => {
          if (!seg.startsWith(':')) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          keys.push(seg.slice(1));
          return '([^/]+)';
        })
        .join('/');
      return { action, regex: new RegExp('^' + body + '$'), keys };
    });
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export function startServer(actions: ActionDef[], port: number): Promise<() => void> {
  const routes = compile(actions);
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

    for (const route of routes) {
      if (route.action.http![0] !== method) continue;
      const m = route.regex.exec(url.pathname);
      if (!m) continue;
      try {
        const raw: Record<string, unknown> = {};
        route.keys.forEach((k, i) => {
          raw[k] = decodeURIComponent(m[i + 1]!);
        });
        const body =
          method === 'GET' || method === 'HEAD' ? {} : await readBody(req);
        Object.assign(raw, body);
        for (const [k, v] of url.searchParams) raw[k] = v;

        // 归一化：query 来的字符串 / body 里的原生值，都过同一套规则
        const fields = describeInput(route.action);
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          const desc = fields.find((f) => f.name === k);
          normalized[k] = desc ? normalizeCliValue(desc, v) : v;
        }

        const input = parseInput(route.action, normalized);
        const data = parseOutput(route.action, await route.action.run(input));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, data }));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
      }
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '接口不存在' }));
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(() => {
        server.close();
      });
    });
  });
}
