// 日志查看器：一行一条，虚拟滚动 + ANSI 着色。
//
// 为什么要两个库：
//   react-virtuoso  脚本与服务的输出经常上千行，全量 DOM 渲染会卡住整页；
//                   虚拟滚动只渲染视口内的行，滚动仍然顺滑。
//   ansi-to-html    CLI 的输出带 ANSI 颜色（错误红、成功绿），直接当文本显示是一堆
//                   `\u001b[31m`；转成 span 才和终端里看到的一致。
//
// 安全：转换时开 escapeXML，脚本输出里的 <script> 会被转义，插进 innerHTML 也不会执行。
import { useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import AnsiToHtml from 'ansi-to-html';

const ansi = new AnsiToHtml({
  fg: '#14161a',
  bg: 'transparent',
  newline: false,
  escapeXML: true,
});

interface Props {
  text: string;
  empty?: string;
  className?: string;
}

export function LogView({ text, empty = '（无输出）', className }: Props) {
  // 行切分只在文本变化时做一次：日志动辄几万字符，每次渲染都 split 会拖死滚动
  const lines = useMemo(() => (text ? text.replace(/\r\n?/g, '\n').split('\n') : []), [text]);

  if (!lines.length) return <div className="log-empty">{empty}</div>;

  return (
    <Virtuoso
      className={'log-view' + (className ? ' ' + className : '')}
      data={lines}
      itemContent={(_, line) => (
        <div className="log-line" dangerouslySetInnerHTML={{ __html: ansi.toHtml(line) || '&nbsp;' }} />
      )}
      followOutput="smooth"
      increaseViewportBy={200}
    />
  );
}
