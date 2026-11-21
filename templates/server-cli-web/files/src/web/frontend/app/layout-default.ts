// 默认壳的**唯一**常量。
//
// 为什么单独一个文件：pages.ts 需要知道「没写 layout 时用哪个壳」，
// 但它不能 import layouts.ts——layouts.ts 会 import 壳组件，壳组件又会
// import nav.ts，nav.ts 再 import pages.ts，形成循环依赖。浏览器里表现
// 不是报错而是白屏：Cannot access '...' before initialization。
//
// 所以把「常量」与「壳清单」分开：pages.ts 只碰常量，不碰组件。
export const DEFAULT_LAYOUT = 'sidebar';
