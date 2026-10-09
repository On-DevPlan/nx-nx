// Logo 实时预览：内联 SVG，改字母/配色立刻重绘。从 view.tsx 拆出以控制文件行数。
//
// scheme 的中文名与色值——**只用于预览渲染**，真实取值仍以模板钩子为准。
// 面板必须能在没有网络/没有模板钩子的情况下画出预览，所以这里留一份展示用副本。
//
// 与生成器用的是**同一套几何规则**（圆角、字号占比、颜色），
// 但这里是简化的单行文本——预览只需表意，不必像素级复刻点阵字模。
export const SCHEME_PREVIEW: Record<string, { name: string; bg: string; fg: string }> = {
  klein: { name: '克莱因蓝', bg: '#002EA6', fg: '#FFE76F' },
  mars: { name: '马尔斯绿', bg: '#01847F', fg: '#F9D2E4' },
  hermes: { name: '爱马仕橙', bg: '#FF770F', fg: '#000026' },
  tiffany: { name: '蒂芙尼蓝', bg: '#80D1C8', fg: '#F8F5D6' },
  red: { name: '中国红', bg: '#FF0000', fg: '#FAEAD3' },
  vandyke: { name: '凡戴克棕', bg: '#492D22', fg: '#D8C7B5' },
  prussian: { name: '普鲁士蓝', bg: '#003153', fg: '#E5DDD7' },
};

export function LogoPreview({
  letters,
  scheme,
  size = 96,
}: {
  letters: string;
  scheme: string;
  size?: number;
}) {
  const s = SCHEME_PREVIEW[scheme] || SCHEME_PREVIEW.mars!;
  const text = letters.slice(0, 5);
  const fontSize = Math.round((size * 0.72) / Math.max(1, text.length) / 0.62);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="logo-preview">
      <rect width={size} height={size} rx={size * 0.22} ry={size * 0.22} fill={s.bg} />
      <text
        x="50%"
        y="50%"
        fill={s.fg}
        fontSize={fontSize}
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Verdana, 'Segoe UI', Arial, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}
