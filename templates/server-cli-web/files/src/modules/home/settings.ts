// home 域的设置规则：**被两条 action 共用**的那部分（校验/归一 + 人读渲染）。
//
// 为什么不放 schemas.ts：那里是 zod 契约（字段形状与类型）；
// 这里是人写的归一规则（'a,b' / JSON 串 / 数组 三种写法都要认）与 CLI 提示文本。
// 为什么不放某个 action 文件：get 与 set 都要用——放一边会让另一边跨文件依赖同类。
//
// 「一条 action 一个文件」是模块的默认形状；只有**确实被多条 action 共用**的规则
// 才值得单独成文件（当前只有这一处）。
import { badInput } from '../../core/errors/index.js';
import type { NavGroup, Settings } from '../../core/store.js';

export type { NavGroup, Settings };

/** 已知设置项 → 校验器 + 说明（面板据此提示）。 */
export const SETTINGS_SCHEMA: Record<string, { hint: string; coerce: (v: unknown) => unknown }> = {
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

// 函数声明（会提升）：SETTINGS_SCHEMA 在模块顶层引用它们，const 箭头函数会踩 TDZ
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
 * 与「页面存不存在」无关。而「空分组」不拒绝：后端不知道一共有哪些页面，
 * 就没资格判断这个分组是不是空的；前端 nav-model 的 validate 会提示。
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

/** 设置项的说明清单（面板与 CLI 共用）。 */
export function settingsSchemaList(): { key: string; hint: string }[] {
  return Object.entries(SETTINGS_SCHEMA).map(([key, s]) => ({ key, hint: s.hint }));
}

/** get 的 CLI 人读渲染。 */
export function renderSettings(settings: Settings): string {
  const lines = [`当前设置（改：{{name}} setting set --set k=v）· 主题: ${settings.theme || 'light'}`];
  for (const s of settingsSchemaList()) lines.push(`  ${s.key.padEnd(12)} ${s.hint}`);

  const order = settings.navOrder || [];
  const groups = settings.navGroups || [];
  const hidden = settings.navHidden || [];

  lines.push('', `隐藏 ${hidden.length} 个 · 分组 ${groups.length} 个`);
  if (hidden.length) lines.push(`  隐藏: ${hidden.join(', ')}`);
  if (order.length) lines.push(`  平铺顺序: ${order.join(' → ')}`);
  for (const g of groups) lines.push(`  ${g.title}: ${g.views.join(' → ') || '(空)'}`);

  // 页面清单不在后端：它由前端 routes/*.ts 决定，后端只存「摆法」。
  lines.push('', '页面清单由前端路由树决定（src/web/frontend/routes/），可用 panel 查看。');
  lines.push('例：{{name}} setting set --set \'navGroups=[{"title":"求职","views":["home"]}]\' --dry-run');
  return lines.join('\n');
}

/** set 的 CLI 人读渲染。 */
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
