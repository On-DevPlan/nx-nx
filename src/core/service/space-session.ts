// 管理空间的常驻会话：让空间在多次调用之间**保持同一个实例**。
//
// 为什么需要：
//   一次性动作（每次新起子进程重新装载面板）会让空间「每次都是新的」——
//   状态堆每次重置、调用栈永远为空。那样空间就只是一段跑完就散的脚本，
//   不是实体。常驻会话装载一次面板，之后所有动作都在这同一个空间上跑，
//   状态与调用痕迹才会累积。
//
// 边界（core 只做派发，永远不执行用户代码）：
//   会话是 _runner.mjs 的一个子进程，走 stdin/stdout 的 NDJSON 协议：
//     请求 {id, action, method, args} → 回 {id, ok, ...}（NX_NS_RESULT 标记行）
//   动作串行执行——空间方法可能改自身状态，并发调是自找麻烦。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { runnerPath } from '../script/paths.js';

const RESULT_MARK = 'NX_NS_RESULT ';
/** 空闲多久就收掉会话进程（省资源；下次调用会自动重开） */
const DEFAULT_IDLE_MS = 5 * 60 * 1000;
/** 单个动作的等待上限 */
const DEFAULT_TIMEOUT_MS = 15000;

export interface SessionRequest {
  action: 'introspect' | 'call' | 'check';
  method?: string;
  args?: unknown[];
}

export interface SessionReply {
  ok: boolean;
  action?: string;
  method?: string;
  error?: string;
  [k: string]: unknown;
}

interface Waiter {
  resolve: (v: SessionReply) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** 一个常驻的空间进程 */
class SpaceSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buf = '';
  private seq = 0;
  private waiters = new Map<number, Waiter>();
  private idleTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly panelPath: string,
    private readonly idleMs: number = DEFAULT_IDLE_MS,
  ) {}

  /** 发一个动作，等它回来 */
  async request(req: SessionRequest, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SessionReply> {
    if (this.closed) throw new Error('空间会话已关闭');
    const child = this.ensureChild();
    const id = ++this.seq;
    const promise = new Promise<SessionReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        // 超时多半意味着会话卡住了——直接收掉，下次调用重开一个干净的。
        this.kill();
        reject(new Error(`空间会话请求超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.waiters.set(id, { resolve, reject, timer });
    });
    try {
      child.stdin.write(
        JSON.stringify({
          id,
          action: req.action,
          method: req.method ?? '',
          args: req.args ?? [],
        }) + '\n',
      );
    } catch (err) {
      const w = this.waiters.get(id);
      this.waiters.delete(id);
      if (w) clearTimeout(w.timer);
      this.kill();
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }    this.touchIdle();
    return promise;
  }

  /** 结束会话：杀进程、拒绝所有在途请求 */
  close(): void {
    this.closed = true;
    this.kill();
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NX_SHARED_PANEL: this.panelPath,
      NX_NS_SESSION: '1',
    };
    // 面板里的 serviceCheck / serviceAlive 要靠它回连本机 API
    if (process.env.NX_NX_SERVE_PORT) env['NX_NX_SERVE_PORT'] = process.env.NX_NX_SERVE_PORT;
    const child = spawn(process.execPath, [runnerPath()], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => this.onStdout(d));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => {
      /* 面板自己的输出：忽略（诊断信息以结果为准） */
    });
    child.on('error', (err) => this.failAll(err.message));
    child.on('close', () => {
      this.child = null;
      this.failAll('空间会话进程已退出');
    });
    // 不让会话进程把宿主进程钉住：CLI 跑完就能退，serve 也不会被拖住。
    child.unref();
    unrefStream(child.stdin);
    unrefStream(child.stdout);
    unrefStream(child.stderr);
    this.touchIdle();
    return child;
  }

  /** stdout 里找 NX_NS_RESULT 标记行；其余行（面板自己的打印）忽略 */
  private onStdout(chunk: string): void {
    this.buf += chunk;
    let idx = this.buf.indexOf('\n');
    while (idx >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line.startsWith(RESULT_MARK)) this.onResult(line.slice(RESULT_MARK.length));
      idx = this.buf.indexOf('\n');
    }
  }

  private onResult(json: string): void {
    let obj: SessionReply & { id?: number | null };
    try {
      obj = JSON.parse(json) as SessionReply & { id?: number | null };
    } catch {
      return;
    }
    const id = obj?.id;
    if (typeof id !== 'number') return;
    const w = this.waiters.get(id);
    if (!w) return;
    this.waiters.delete(id);
    clearTimeout(w.timer);
    w.resolve(obj);
  }

  private failAll(reason: string): void {
    for (const [, w] of this.waiters) {
      clearTimeout(w.timer);
      // 会话层面的失败（进程退出 / 写不进去）——用 reject 表达，
      // 好让调用方知道「不是方法报错，是会话没了」，进而退回一次性路径。
      w.reject(new Error(reason));
    }
    this.waiters.clear();
    this.clearIdle();
  }

  private kill(): void {
    this.clearIdle();
    const child = this.child;
    this.child = null;
    this.failAll('空间会话已结束');
    if (!child) return;
    try {
      child.stdin.end();
    } catch {
      /* 已经断了 */
    }
    child.kill();
  }

  private touchIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.kill();
    }, this.idleMs);
    // 别让空闲计时器把进程钉住
    this.idleTimer.unref?.();
  }

  private clearIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

/** 让一个流不阻止宿主进程退出（socket 有 unref，普通流没有） */
function unrefStream(stream: unknown): void {
  const s = stream as { unref?: () => void } | null;
  s?.unref?.();
}

// ---- 会话池（按面板路径）----

const sessions = new Map<string, SpaceSession>();

/** 取（必要时创建）某个面板的常驻会话 */
export function getSpaceSession(panelPath: string): SpaceSession {
  let s = sessions.get(panelPath);
  if (!s) {
    s = new SpaceSession(panelPath);
    sessions.set(panelPath, s);
  }
  return s;
}

/** 当前有多少个常驻会话（诊断用） */
export function spaceSessionCount(): number {
  return sessions.size;
}

/** 全部收掉：serve 退出、CLI 结束时调用 */
export function closeAllSpaceSessions(): void {
  for (const [, s] of sessions) s.close();
  sessions.clear();
}

// 进程退出时兜底：别把会话子进程留成孤儿
process.on('exit', () => {
  for (const [, s] of sessions) s.close();
});
