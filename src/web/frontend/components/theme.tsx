// antd 主题：把组件库的默认「蓝色 SaaS 味」压回本项目的视觉规范。
//
// 为什么要做这一层（而不是直接用 antd 默认主题）：
//   style.css 顶部写死了本骨架的视觉规范——黑白灰为主、只有 --bad 一个语义色、
//   行高 28px、按钮 32px、核心字号 12px、1px 浅底线分隔、不靠卡片阴影堆叠。
//   antd 默认主题是蓝色主色 + 圆角 6px + 12px 控件高 + 一堆阴影，直接套上去
//   会和既有页面（模板页 / 脚本页的原生 CSS）打架，出现「两套面板」的样子。
//   所以这里把 antd 的 token 对齐到 style.css 的变量：同一次会话里
//   antd 组件与原生 CSS 组件看起来是同一套东西。
//
// 换肤的唯一入口：改 style.css 的 :root 变量，这里跟着变。
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';

// 与 style.css 的 tokens 一一对应（那边是唯一真相源，这里只是把值抄过来给 antd）
const INK = '#14161a';
const PAPER = '#fff';
const SOFT = '#f5f6f7';
const SOFT_2 = '#ebedf0';
const MID = '#8b9096';
const BAD = '#b3261e';

const theme = {
  token: {
    colorPrimary: INK,
    colorInfo: INK,
    colorSuccess: '#2f9e44',
    colorWarning: '#c47f17',
    colorError: BAD,
    colorTextBase: INK,
    colorBgBase: PAPER,
    colorBgLayout: PAPER,
    colorBorder: SOFT_2,
    colorBorderSecondary: SOFT_2,
    // 语义色之外的填充一律走灰阶，避免「蓝底按钮 + 灰底面板」拼贴
    colorFillSecondary: SOFT,
    colorFillTertiary: SOFT,
    colorFillQuaternary: SOFT,

    borderRadius: 4,
    borderRadiusLG: 6,
    borderRadiusSM: 3,

    // 密度：控件高度对齐 style.css 的 --row-h(28) / --btn-h(32)
    controlHeight: 28,
    controlHeightSM: 22,
    controlHeightLG: 32,
    fontSize: 12,
    fontSizeSM: 11,
    fontSizeLG: 13,
    lineHeight: 1.5,

    // 立体感只留给按钮（与 style.css 的 --shadow-relief 一致）
    boxShadow: 'none',
    boxShadowSecondary: 'none',
    boxShadowTertiary: 'none',
    wireframe: false,

    // 浮层类颜色（Tooltip / Popover / Drawer / Empty 文案）——
    // antd 6 把这些放在全局 alias 层，不在组件层
    colorBgSpotlight: INK,
    colorBgElevated: PAPER,
    colorTextDescription: MID,
  },
  components: {
    Button: {
      // 主按钮：黑底白字，不加渐变
      fontWeight: 500,
      paddingInline: 12,
    },
    Card: {
      // 卡片靠 1px 边框分隔，不靠阴影
      headerFontSize: 13,
    },
    Table: {
      headerBg: SOFT,
      headerColor: INK,
      rowHoverBg: SOFT,
      borderColor: SOFT_2,
      cellPaddingBlock: 6,
      cellPaddingInline: 12,
      fontSize: 12,
    },
    Input: {
      paddingBlock: 4,
    },
    Select: {
      optionSelectedBg: SOFT_2,
    },
    Tabs: {
      itemColor: MID,
      itemSelectedColor: INK,
      itemHoverColor: INK,
      inkBarColor: INK,
      horizontalItemPadding: '8px 0',
      horizontalItemGutter: 24,
      titleFontSize: 13,
    },
    Modal: {
      titleFontSize: 14,
      headerBg: PAPER,
      borderRadiusLG: 8,
    },
    Form: {
      labelColor: MID,
      labelFontSize: 12,
      verticalLabelPadding: '0 0 4px',
      itemMarginBottom: 12,
    },
    Descriptions: {
      titleMarginBottom: 8,
      labelBg: SOFT,
      contentBg: PAPER,
    },
    Tag: {
      defaultBg: SOFT,
      defaultColor: MID,
    },
    Segmented: {
      itemSelectedBg: PAPER,
      itemSelectedColor: INK,
      trackBg: SOFT,
    },
    Switch: {
      colorPrimary: INK,
      colorPrimaryHover: INK,
    },
    Checkbox: {
      colorPrimary: INK,
    },
    Radio: {
      colorPrimary: INK,
    },
    Statistic: {
      contentFontSize: 18,
    },
    Timeline: {
      dotBorderWidth: 1,
    },
    Collapse: {
      headerBg: PAPER,
      contentBg: PAPER,
      headerPadding: '6px 12px',
      contentPadding: '10px 12px',
    },
    Tree: {
      titleHeight: 28,
      nodeSelectedBg: SOFT,
    },
    Progress: {
      defaultColor: INK,
    },
    Divider: {
      colorSplit: SOFT_2,
    },
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      {children}
    </ConfigProvider>
  );
}
