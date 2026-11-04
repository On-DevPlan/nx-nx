// 页面声明：一个 views/<名>/route.ts 就是**一个页面**。
//
// 这里没有「页面登记表」。页面的存在性由文件系统决定（router.ts 用
// import.meta.glob 扫描 views/*/route.ts），页面 id 取自目录名，
// 标题 / 排序 / 挂在哪个壳下都写在下面这一个对象里。
//
// 为什么这样分：
//   - action 是**双端契约**（同一件事要在 CLI 与 HTTP 各暴露一次），所以它值得
//     一份声明管两端；
//   - 页面是**纯前端事实**（有哪些页、叫什么、怎么摆），后端没有理由知道。
// 把页面也塞进 action 那套「两端都要登记」的模型里，就是拿后端的规矩管前端。
import type { ComponentType } from 'react';

export interface NavMeta {
  /** 导航里显示的名字。**省略整个 nav 字段 = 这个页面不进导航**（详情页 / 向导步骤 / 全屏页） */
  label: string;
  /** 平铺顺序，小的在前；没写按 id 兜底 */
  order?: number;
}

export interface PageDef {
  /** 路由路径（hash 路由里 `#` 之后的部分），必须以 / 开头 */
  path: string;
  nav?: NavMeta;
  /** 挂到哪个壳下，默认 'app'；可选值见 app/layouts.ts */
  layout?: string;
  /** 页面组件。必须是函数形式，Vite 才能保住按页代码分割 */
  page: () => Promise<{ default: ComponentType }>;
}

/**
 * 唯一的写法入口。当前只做类型收窄，不做运行期校验——
 * 目录名、path 唯一性这些由 tests/unit/views.test.mjs 统一对账，
 * 校验逻辑只有一份，不散落在每个 route.ts 里。
 */
export function definePage(def: PageDef): PageDef {
  return def;
}
