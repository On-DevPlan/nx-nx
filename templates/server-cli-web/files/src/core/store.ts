// JSON 存储：用户目录下的单一数据文件，Web 表单与 agent CLI 共同读写。
//
// 服务层的 OOP 约定（本模板的 serve 风格）：**有状态的能力用类组织**——
// 进程内缓存收在 JsonStore 实例里，而不是散在模块级变量上；
// 依赖经构造函数注入（HomeService 拿到的 store 就是这里导出的单例），
// 测试想换实现时传一个新实例即可。action 装配层（runtime/types 的 builder）
// 保持声明式不变——那是类型系统的基础，不属于「业务服务」这一层。
//
// 设计要点：
// - 原子写（临时文件 + rename），进程中断不会损坏数据
// - 进程内缓存 + mtime 失效检测：外部进程（如 CLI）改写后，Web 服务侧能立刻看到
// - 自己写入后主动刷新缓存 mtime，避免「自己触发自己重读」
//
// 这是**通用**存储：结构由 initialState() 决定。项目要加字段就改它，
// normalize 会自动给老数据补默认值——不需要写迁移脚本。
import fsp from 'node:fs/promises';
import { dirname } from 'node:path';
import { storePathFromEnv } from './paths.js';

// 项目自己的存储结构。改这里即可扩展，老数据由 normalize 自动补齐。
export interface NavGroup {
  title: string;
  /** 组内页面 id（数组顺序 = 头部展开列表里的顺序） */
  views: string[];
}

export interface Settings {
  /** 头部导航分组：数组顺序 = 显示顺序；一个页面最多属于一个组 */
  navGroups: NavGroup[];
  /** 被隐藏的页面 id：头部不显示入口，`#/id` 直达仍可用 */
  navHidden: string[];
  /** 平铺区的显示顺序（页面 id 数组；没列进去的按页面自身顺序跟在后面） */
  navOrder: string[];
  /** 色彩主题：light（浅色）/ dark（深色）/ auto（跟随系统） */
  theme: string;
  [k: string]: unknown;
}

export interface StoreState {
  version: number;
  settings: Settings;
  [k: string]: unknown;
}

export function initialState(): StoreState {
  return {
    version: 1,
    settings: { navGroups: [], navHidden: [], navOrder: [], theme: 'light' },
  };
}

export function newId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 归一化：以 initialState() 为底，把已有数据合并上去。
// 新增字段自动获得默认值，因此**不需要迁移脚本**——
// 老 store.json 缺的键会在这里补齐，多出来的键也原样保留。
export function normalize(data: unknown): StoreState {
  const base = initialState();
  if (!data || typeof data !== 'object') return base;
  const d = data as Record<string, unknown>;

  base.version = typeof d.version === 'number' ? d.version : base.version;
  if (base.settings && typeof base.settings === 'object') {
    base.settings = { ...base.settings, ...((d.settings as Record<string, unknown>) || {}) };
  }

  // 其余顶层键：base 里声明过的按 base 的形状兜底，没声明过的原样带过来
  for (const [k, v] of Object.entries(d)) {
    if (k === 'version' || k === 'settings') continue;
    if (Array.isArray(v)) {
      base[k] = v;
    } else if (v && typeof v === 'object') {
      const existing = base[k];
      base[k] = { ...((existing as object) || {}), ...(v as object) };
    } else {
      base[k] = v;
    }
  }
  return base;
}

/**
 * JSON 存储的面向对象封装。
 *
 * 实例即边界：cache / cacheMtime 是私有状态，外部只能经由方法触达；
 * 默认导出的 store 是全项目共享的单例（与 storePathFromEnv 的环境变量约定配套）。
 */
export class JsonStore {
  private cache: StoreState | null = null;
  private cacheMtime = -1;

  /** 读存储。文件不存在或损坏时返回空结构（首次运行 / 允许外部修复后恢复）。 */
  async load(explicitPath?: string): Promise<StoreState> {
    const p = explicitPath || storePathFromEnv();
    try {
      const st = await fsp.stat(p);
      if (this.cache && this.cacheMtime === st.mtimeMs) return this.cache;
      const raw = await fsp.readFile(p, 'utf8');
      this.cache = normalize(JSON.parse(raw));
      this.cacheMtime = st.mtimeMs;
      return this.cache;
    } catch {
      this.cache = normalize(null);
      this.cacheMtime = -1;
      return this.cache;
    }
  }

  /** 原子写：先写临时文件再改名，进程中断不会留下半个文件。 */
  async save(next: StoreState, explicitPath?: string): Promise<StoreState> {
    const p = explicitPath || storePathFromEnv();
    const data = normalize(next);
    await fsp.mkdir(dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, p);
    this.cache = data;
    try {
      this.cacheMtime = (await fsp.stat(p)).mtimeMs;
    } catch {
      this.cacheMtime = -1;
    }
    return data;
  }

  /**
   * 读-改-写事务：fn 直接修改传入的深拷贝 store；fn 抛错则不落盘。
   * 这条语义很重要——半个事务写进磁盘比不写更糟。
   */
  async mutate<T>(fn: (s: StoreState) => T, explicitPath?: string): Promise<T | StoreState> {
    const cur = structuredClone(await this.load(explicitPath));
    const result = fn(cur);
    await this.save(cur, explicitPath);
    return result === undefined ? cur : result;
  }

  /** 测试与调试用：清掉进程内缓存，强制下次重读 */
  clearCache(): void {
    this.cache = null;
    this.cacheMtime = -1;
  }
}

/** 全项目共享的存储单例。业务服务（HomeService 等）经构造函数注入使用它。 */
export const store = new JsonStore();
