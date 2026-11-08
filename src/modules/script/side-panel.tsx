// 脚本工作台右侧：运行输出 / 内置函数清单。
//
// 组件库：antd Tabs + Badge（token 见 components/theme.tsx）。
import { Badge, Empty, Tabs } from 'antd';
import type { AliasInfo, RunResult } from './helpers.js';

interface Props {
  tab: 'output' | 'aliases';
  onTab: (tab: 'output' | 'aliases') => void;
  runResult: RunResult | null;
  aliasGroups: [string, AliasInfo[]][];
}

export function ScriptSide({ tab, onTab, runResult, aliasGroups }: Props) {
  const stdout = runResult?.stdout.trimEnd() ?? '';
  const stderr = runResult?.stderr.trimEnd() ?? '';

  const output = (
    <div className="script-output">
      {!runResult && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行后在这里看标准输出与错误" />}
      {runResult && (
        <>
          <div className="script-run-meta">
            <Badge
              status={runResult.code === 0 ? 'success' : 'error'}
              text={`退出码 ${runResult.code}`}
            />
            <span className="muted mono">{runResult.script}</span>
          </div>
          {stdout && <pre className="script-stdout">{stdout}</pre>}
          {stderr && <pre className="script-stderr">{stderr}</pre>}
          {!stdout && !stderr && <div className="empty">（无输出）</div>}
        </>
      )}
    </div>
  );

  const aliases = (
    <div className="script-aliases">
      {!aliasGroups.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内置函数" />}
      {aliasGroups.map(([group, items]) => (
        <div key={group}>
          <div className="opt-group-head">
            <span>{group}</span>
            <span className="opt-group-count">{items.length}</span>
          </div>
          {items.map((a) => (
            <div key={a.name} className="row">
              <div className="name mono">{a.name}</div>
              <div className="desc">{a.desc}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="card script-side">
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(k) => onTab(k as 'output' | 'aliases')}
        items={[
          { key: 'output', label: '输出', children: output },
          { key: 'aliases', label: '内置函数', children: aliases },
        ]}
      />
    </div>
  );
}
