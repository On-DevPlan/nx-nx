// 设置项读写与**严格校验**（含头部导航：分组 / 隐藏 / 平铺顺序）。
//
// 设置是显示与行为的开关，写坏了界面就少一块或摆错位——所以这里不静默丢任何东西：
// 未知设置项、页面不存在、一个页面进了两个分组、空分组、组名空，一律报错说清哪一项。
// 页面清单来自 core/views.js（唯一来源），所以后端能真的校验 id，而不只是校验形状。
import { loadStore, mutateStore } from '../../core/store.js';
import { VIEWS_META, viewMetaOf } from '../../core/views.js';
import { badInput, notFound } from '../../core/errors/index.js';

/** 已知设置项 → 说明 + 校验器（面板的设置页据此提示）。 */
const SCHEMA = {
  navGroups: { hint: '头部导航分组：[{title, views:[页面id…]}]，数组顺序 = 显示顺序', coerce: coerceNavGroups },
  navHidden: { hint: '隐藏的页面 id（入口不显示，直达仍可用）', coerce: coerceNavHidden },
  navOrder: { hint: '平铺区的显示顺序（页面 id 数组；没列进去的按页面自身顺序跟在后面）', coerce: coerceNavOrder },
};

/**
 * 「页面 id 清单」校验（隐藏清单 / 平铺顺序共用）：每一项都必须是真实存在的页面；
 * 去重保序，并归一成真实 id。label 只影响报错措辞。
 * 三种写法都吃：数组（面板）、`a,b`（CLI 省事写法）、`["a","b"]`（CLI 的 JSON 写法）。
 */
function coerceIdList(value, label) {
  let raw = value;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      throw badInput(`${label}需要 JSON 数组或逗号分隔：${e.message}`);
    }
  }
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const out = [];
  for (const item of list) {
    const id = String(item ?? '').trim();
    if (!id) continue;
    if (!viewMetaOf(id)) throw badInput(`${label}里的页面不存在: ${id}`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// 函数声明（会提升）：SCHEMA 在模块顶层引用它们，const 箭头函数会踩 TDZ
function coerceNavHidden(value) {
  return coerceIdList(value, '隐藏清单');
}

function coerceNavOrder(value) {
  return coerceIdList(value, '平铺顺序');
}

/** 分组校验 + 归一：组名非空、页面必须存在、组内去重、跨组重复拒绝、空组拒绝。 */
function coerceNavGroups(value) {
  let arr = value;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch (e) {
      throw badInput(`navGroups 需要 JSON 数组（${e.message}）：[{"title":"求职","views":["home"]}, …]`);
    }
  }
  if (!Array.isArray(arr)) {
    throw badInput('navGroups 需要是数组：[{"title":"求职","views":["home"]}, …]');
  }
  const owner = new Map();
  return arr.map((g, i) => {
    if (!g || typeof g !== 'object') throw badInput(`第 ${i + 1} 个分组不是对象`);
    const title = String(g.title ?? '').trim();
    if (!title) throw badInput(`第 ${i + 1} 个分组缺少 title（组名）`);
    const views = [];
    for (const item of Array.isArray(g.views) ? g.views : []) {
      const id = String(item ?? '').trim();
      if (!id || views.includes(id)) continue; // 组内重复（或空串）直接去重
      if (!viewMetaOf(id)) throw badInput(`分组「${title}」里的页面不存在: ${id}`);
      const ownerTitle = owner.get(id);
      if (ownerTitle) throw badInput(`页面 ${id} 同时在分组「${ownerTitle}」与「${title}」里——一个页面只能属于一个分组`);
      owner.set(id, title);
      views.push(id);
    }
    if (!views.length) throw badInput(`分组「${title}」没有任何页面——要么加一个，要么删掉这个分组`);
    return { title, views };
  });
}

export async function getSettings() {
  const store = await loadStore();
  return {
    settings: store.settings,
    // 页面清单随设置一起给：面板的头部导航与设置页都按它渲染
    views: VIEWS_META.map((v) => ({ ...v })),
    schema: Object.entries(SCHEMA).map(([key, s]) => ({ key, hint: s.hint })),
  };
}

/** PATCH 语义：只改传入的项。返回**最新全量设置**，面板保存后直接拿来刷新头部。 */
export async function setSettings({ key, value, set, 'dry-run': dryRun } = {}) {
  const patch = { ...(set || {}) };
  if (key !== undefined) patch[key] = value;

  const keys = Object.keys(patch);
  if (!keys.length) throw badInput('至少要给一项：setting set --key <名> --value <值>，或 --set k=v（可重复）');

  const resolved = {};
  for (const k of keys) {
    const spec = SCHEMA[k];
    if (!spec) throw notFound(`未知设置项: ${k}（可用: ${Object.keys(SCHEMA).join(', ')}）`);
    resolved[k] = spec.coerce(patch[k]);
  }

  if (dryRun) return { status: 'skipped', dryRun: true, wouldSet: resolved };

  const after = await mutateStore((s) => {
    for (const [k, v] of Object.entries(resolved)) s.settings[k] = v;
    return { ...s.settings };
  });
  return { status: 'ok', settings: after };
}

export function renderSettings(d) {
  const hidden = new Set(d.settings.navHidden || []);
  const lines = ['当前设置（改：nx-sk setting set --set k=v）'];
  for (const s of d.schema) lines.push(`  ${s.key.padEnd(12)} ${s.hint}`);

  lines.push('', `页面（${d.views.length}）· 隐藏 ${hidden.size} 个`);
  for (const v of d.views) {
    lines.push(`  ${v.id.padEnd(12)} ${v.title.padEnd(10)} ${hidden.has(v.id) ? '隐藏' : '显示'}`);
  }

  const ranked = (d.settings.navOrder || []).filter((id) => d.views.some((v) => v.id === id));
  if (ranked.length) lines.push(`平铺顺序（前 ${ranked.length} 个已显式排序）: ${ranked.join(' → ')}`);

  const groups = d.settings.navGroups || [];
  if (!groups.length) {
    lines.push('', '分组：无（全部页面平铺在头部）');
  } else {
    lines.push('', `分组（${groups.length}）· 组顺序 = 头部顺序，组内顺序 = 展开列表顺序`);
    for (const g of groups) lines.push(`  ${g.title}: ${g.views.join(' → ')}`);
  }
  return lines.join('\n');
}

export function renderSettingSet(d) {
  if (d.status === 'skipped') return `试运行（未落盘）：将写入 ${JSON.stringify(d.wouldSet)}`;
  const groups = d.settings?.navGroups || [];
  const hidden = d.settings?.navHidden || [];
  const lines = [`已更新设置：${groups.length} 个导航分组，隐藏 ${hidden.length} 个页面`];
  for (const g of groups) lines.push(`  ${g.title}: ${g.views.join(' → ')}`);
  if (hidden.length) lines.push(`  隐藏: ${hidden.join(', ')}`);
  return lines.join('\n');
}
