// 路由发现：扫 routes/*.ts，产出「有哪些页面」的唯一清单。
//
// 这是取代旧 core/views.ts + 前端组件表 + tests 三方对账的地方。
// 旧做法要把同一个事实写三遍（后端一份、前端组件表一份、测试再钉一遍），
// 任何一处漏写都不当场报错，只是页面悄悄不出现。
//
// 现在只有**一个**来源：文件系统。新建 routes/<名>.ts 就等于登记了一条路由
// （页面本体放 pages/<名>/index.tsx），不需要改任何全局文件。路由 id 就是文件名。
import type { PageDef } from '../routes/contract.js';

// eager: true 只取路由声明本身；page 字段是函数，组件仍然按需加载。
// import: 'default' 直接拿 default 导出，省掉一层 .default 取值。
// contract.ts 是类型契约不是路由声明，负模式把它排除。
const DECLARATIONS = import.meta.glob(['../routes/*.ts', '!../routes/contract.ts'], {
  eager: true,
  import: 'default',
}) as Record<string, PageDef>;

/** '../routes/home.ts' → 'home' */
function idOfModuleKey(key: string): string {
  const m = /\/([^/]+)\.ts$/.exec(key);
  return m ? m[1]! : key;
}

export interface PageEntry {
  id: string;
  def: PageDef;
  /** 导航标题：nav.label；没有 nav 的页面用文件名兜底（只用于排错与占位） */
  title: string;
  order: number;
  layout: string;
}

export const PAGES: PageEntry[] = Object.entries(DECLARATIONS)
  .map(([key, def]) => ({
    id: idOfModuleKey(key),
    def,
    title: def.nav?.label || idOfModuleKey(key),
    order: def.nav?.order ?? 100,
    layout: def.layout || 'app',
  }))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** 进导航的页面（声明了 nav 的那些）。详情页 / 向导页不写 nav，因此天然不出现。 */
export const NAV_PAGES = PAGES.filter((p) => p.def.nav);

/** 按 id 取页面，供「当前页高亮」这类反查用。 */
export function pageById(id: string): PageEntry | undefined {
  return PAGES.find((p) => p.id === id);
}
