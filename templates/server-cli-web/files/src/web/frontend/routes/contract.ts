// 路由契约：routes/<名>.ts 就是**一条路由**，本文件是它们的公共形状。
//
// 这里没有「页面登记表」。路由的存在性由文件系统决定（app/pages.ts 用
// import.meta.glob 扫描 routes/*.ts，contract.ts 自身被负模式排除），路由 id
// 取自文件名，标题 / 排序 / 挂在哪个壳下都写在下面这一个对象里。
//
// 与页面的分工：
//   - routes/<名>.ts   声明「路由信息」：path、是否进导航、挂在哪个壳、组件在哪
//   - pages/<名>/index.tsx   页面组件本体（默认导出），页面私有 api.ts / components/ 与它同目录
//
// 为什么这样分：
//   - action 是**双端契约**（同一件事要在 CLI 与 HTTP 各暴露一次），所以它值得
//     一份声明管两端；
//   - 路由是**纯前端事实**（有哪些页、叫什么、怎么摆），后端没有理由知道。
// 把路由也塞进 action 那套「两端都要登记」的模型里，就是拿后端的规矩管前端。
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
 * 文件名、path 唯一性这些由 tests/unit/routes.test.mjs 统一对账，
 * 校验逻辑只有一份，不散落在每条路由声明里。
 */
export function definePage(def: PageDef): PageDef {
  return def;
}
