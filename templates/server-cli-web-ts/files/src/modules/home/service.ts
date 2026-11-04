// home 域业务逻辑：演示业务动作（greet）+ 本机设置读写。
//
// 关于设置的一个**关键边界**：后端不校验「页面是否存在」。
// 有哪些页面是前端路由树的事实（src/web/frontend/views/），后端既不知道也不需要知道。
// 所以这里只校验**形状**——navGroups 得是 [{title, views:[]}]、navHidden 得是字符串数组——
// 至于 views 里的 id 有没有对应页面，交给前端渲染时忽略即可：配置不会因此失效。
//
// 早先后端 import 了 core/views.ts 拿页面清单做存在性校验，后果是每加一个页面都要
// 改后端，删一个页面还会让整份导航配置报错。那是拿后端的规矩管前端。
import { loadStore, mutateStore } from '../../core/store.js';
import type { NavGroup, Settings } from '../../core/store.js';
import { badInput, notFound } from '../../core/errors/index.js';

// ---- ① 演示业务动作 ----

export interface GreetingResult {
  greeting: string;
  name: string;
  count: number;
  at: string;
}

// 打个招呼，并把问候次数累计进本机存储——演示「面板操作 → 状态落盘」闭环。
//
// 走 mutateStore 读-改-写事务：计数 +1 与落盘是一个原子动作，
// 两个并发请求不会丢计数，函数抛错则半个事务不会写进磁盘。
export async function greet(name: string, loud = false): Promise<GreetingResult> {
  const t = await mutateStore((s) => {
    const count = Number(s.greetCount || 0) + 1;
    s.greetCount = count;
    return count;
  });
  const count = Number(t);

  let greeting = `你好，${name}！这是第 ${count} 次问候。`;
  if (loud) greeting = greeting.toUpperCase();
  return { greeting, name, count, at: new Date().toISOString() };
}

// ---- ② 本机设置 ----

export interface SettingsView {
  settings: Settings;
  schema: { key: string; hint: string }[];
}

/** 已知设置项 → 校验器 + 说明（面板据此提示）。 */
const SCHEMA: Record<string, { hint: string; coerce: (v: unknown) => unknown }> = {
  navGroups: { hint: '导航分组：[{title, views:[页面id…]}]，数组顺序 = 显示顺序', coerce: coerceNavGroups },
  navHidden: { hint: '隐藏的页面 id（入口不显示，直达仍可用）', coerce: coerceNavHidden },
  navOrder: { hint: '平铺区的显示顺序（页面 id 数组；没列进去的按页面自身顺序跟在后面）', coerce: coerceNavOrder },
  theme: { hint: '色彩主题：light（浅色）/ dark（深色）/ auto（跟随系统）', coerce: coerceTheme },
};

/** 主题白名单：只认 light / dark / auto，别的一律拒绝。 */
function coerceTheme(value: unknown): string {
  const t = String(value ?? '').trim().toLowerCase();
  if (!['light', 'dark', 'auto'].includes(t)) {
    throw badInput('主题只能是 light / dark / auto，收到: ' + String(value));
  }
  return t;
}

/**
 * 「页面 id 清单」校验（隐藏清单 / 平铺顺序共用）：只做形状归一（去空白、去重保序）。
 * 三种写法都吃：数组（面板）、`a,b`（CLI 省事写法）、`["a","b"]`（CLI 的 JSON 写法）。
 */
function coerceIdList(value: unknown, label: string): string[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s.startsWith('[')) {
      try {
        raw = JSON.parse(s);
      } catch (e) {
        throw badInput(`${label}需要 JSON 数组或逗号分隔：${(e as Error).message}`);
      }
    }
  }
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const out: string[] = [];
  for (const item of list) {
    const id = String(item ?? '').trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// 函数声明（会提升）：SCHEMA 在模块顶层引用它们，const 箭头函数会踩 TDZ
function coerceNavHidden(value: unknown): string[] {
  return coerceIdList(value, '隐藏清单');
}

function coerceNavOrder(value: unknown): string[] {
  return coerceIdList(value, '平铺顺序');
}

/**
 * 分组校验 + 归一：组名非空、组内去重、跨组重复拒绝。
 *
 * 跨组重复仍然拒绝——那是**摆法本身的矛盾**（一个页面不能同时出现在两处入口），
 * 与「页面存不存在」无关。而「空分组」不再拒绝：后端不知道一共有哪些页面，
 * 就没资格判断这个分组是不是空的；前端 navModel.validate 会提示。
 */
function coerceNavGroups(value: unknown): NavGroup[] {
  let arr: unknown = value;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch (e) {
      throw badInput(`navGroups 需要 JSON 数组（${(e as Error).message}）：[{"title":"求职","views":["home"]}, …]`);
    }
  }
  if (!Array.isArray(arr)) {
    throw badInput('navGroups 需要是数组：[{"title":"求职","views":["home"]}, …]');
  }
  const owner = new Map<string, string>();
  return arr.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw badInput(`第 ${i + 1} 个分组不是对象`);
    const g = raw as { title?: unknown; views?: unknown };
    const title = String(g.title ?? '').trim();
    if (!title) throw badInput(`第 ${i + 1} 个分组缺少 title（组名）`);
    const views: string[] = [];
    for (const item of Array.isArray(g.views) ? g.views : []) {
      const id = String(item ?? '').trim();
      if (!id || views.includes(id)) continue; // 组内重复（或空串）直接去重
      const ownerTitle = owner.get(id);
      if (ownerTitle) throw badInput(`页面 ${id} 同时在分组「${ownerTitle}」与「${title}」里——一个页面只能属于一个分组`);
      owner.set(id, title);
      views.push(id);
    }
    return { title, views };
  });
}

export async function getSettings(): Promise<SettingsView> {
  const store = await loadStore();
  return {
    settings: store.settings,
    schema: Object.entries(SCHEMA).map(([key, s]) => ({ key, hint: s.hint })),
  };
}

/**
 * PATCH 语义：只改传入的项。
 * 返回 `{ settings }` 的**最新全量**（面板保存后直接拿来刷新导航）。
 */
export async function setSettings(input: {
  key?: string;
  value?: unknown;
  set?: Record<string, unknown>;
  'dry-run'?: boolean;
}): Promise<
  | { status: 'skipped'; dryRun: true; wouldSet: Record<string, unknown> }
  | { status: 'ok'; settings: Settings }
> {
  const patch: Record<string, unknown> = { ...(input.set || {}) };
  if (input.key !== undefined) patch[input.key] = input.value;

  const keys = Object.keys(patch);
  if (!keys.length) throw badInput('至少要给一项：setting set --key <名> --value <值>，或 --set k=v（可重复）');

  const resolved: Record<string, unknown> = {};
  for (const k of keys) {
    const spec = SCHEMA[k];
    if (!spec) throw notFound(`未知设置项: ${k}（可用: ${Object.keys(SCHEMA).join(', ')}）`);
    resolved[k] = spec.coerce(patch[k]);
  }

  if (input['dry-run']) return { status: 'skipped', dryRun: true, wouldSet: resolved };

  const after = (await mutateStore((s) => {
    const settings = s.settings as Settings;
    for (const [k, v] of Object.entries(resolved)) (settings as Record<string, unknown>)[k] = v;
    return { ...settings };
  })) as Settings;

  return { status: 'ok', settings: after };
}

export function renderSettings(d: SettingsView): string {
  const lines = [`当前设置（改：{{name}} setting set --set k=v）· 主题: ${d.settings.theme || 'light'}`];
  for (const s of d.schema) lines.push(`  ${s.key.padEnd(12)} ${s.hint}`);

  const order = d.settings.navOrder || [];
  const groups = d.settings.navGroups || [];
  const hidden = d.settings.navHidden || [];

  lines.push('', `隐藏 ${hidden.length} 个 · 分组 ${groups.length} 个`);
  if (hidden.length) lines.push(`  隐藏: ${hidden.join(', ')}`);
  if (order.length) lines.push(`  平铺顺序: ${order.join(' → ')}`);
  for (const g of groups) lines.push(`  ${g.title}: ${g.views.join(' → ') || '(空)'}`);

  // 页面清单不在后端：它由前端 views/*/route.ts 决定，后端只存「摆法」。
  lines.push('', '页面清单由前端路由树决定（src/web/frontend/views/*/route.ts），可用 panel 查看。');
  lines.push('例：{{name}} setting set --set \'navGroups=[{"title":"求职","views":["home"]}]\' --dry-run');
  return lines.join('\n');
}

export function renderSettingSet(d: {
  status: string;
  dryRun?: boolean;
  wouldSet?: unknown;
  settings?: Settings;
}): string {
  if (d.status === 'skipped') return `试运行（未落盘）：将写入 ${JSON.stringify(d.wouldSet)}`;
  const groups = d.settings?.navGroups || [];
  const hidden = d.settings?.navHidden || [];
  const lines = [`已更新设置：${groups.length} 个导航分组，隐藏 ${hidden.length} 个页面`];
  for (const g of groups) lines.push(`  ${g.title}: ${g.views.join(' → ') || '(空)'}`);
  if (hidden.length) lines.push(`  隐藏: ${hidden.join(', ')}`);
  return lines.join('\n');
}
