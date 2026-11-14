// 脚本工作台右侧：输出 / 变量堆 / 内置函数 / 运行台账。
//
// 四块内容的共同点：都是「这次执行产生了什么」的不同切面。
//   output   过程（stdout / stderr，带 ANSI 色，虚拟滚动）
//   heap     产出（变量堆：键 / 类型 / 描述 / 可复制 JSON）
//   aliases  能力（脚本里能直接调的内置函数）
//   runs     历史（每次运行一行，点一行看当时报了什么错）
import { Badge, Empty, Tabs, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LogView } from './log-view.js';
import type { AliasInfo, HeapRow, RunRecord, RunResult, SandboxResult, SideTab } from './helpers.js';

interface Props {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  runResult: RunResult | null;
  sandbox: SandboxResult | null;
  heap: HeapRow[];
  aliasGroups: [string, AliasInfo[]][];
  runs: RunRecord[];
  runsLoading: boolean;
}

const heapColumns: ColumnsType<HeapRow> = [
  {
    title: '键',
    dataIndex: 'key',
    width: 120,
    render: (v: string) => <span className="mono heap-key">{v}</span>,
  },
  {
    title: '类型',
    dataIndex: 'type',
    width: 90,
    render: (v: string) => <Tag className="tag-type">{v}</Tag>,
  },
  {
    title: '值 / 说明',
    dataIndex: 'describe',
    render: (v: string, row) => (
      <Typography.Text
        className="mono heap-desc"
        copyable={row.json !== null && row.json !== undefined ? { text: JSON.stringify(row.json, null, 2) } : false}
        ellipsis={{ tooltip: v }}
      >
        {v}
      </Typography.Text>
    ),
  },
];

const runColumns: ColumnsType<RunRecord> = [
  {
    title: '时间',
    dataIndex: 'at',
    width: 150,
    render: (v: string) => <span className="mono run-at">{v.replace('T', ' ').slice(0, 19)}</span>,
  },
  {
    title: '结果',
    dataIndex: 'ok',
    width: 64,
    render: (v: boolean) => <Badge status={v ? 'success' : 'error'} text={v ? 'ok' : 'FAIL'} />,
  },
  { title: '耗时', dataIndex: 'durationMs', width: 74, render: (v: number) => <span className="mono">{v}ms</span> },
  {
    title: '来源 / 产出',
    key: 'src',
    render: (_, r) => (
      <div className="run-src">
        <span className="mono">{r.source}</span>
        {r.heapKeys.length > 0 && <span className="muted"> → {r.heapKeys.join(', ')}</span>}
        {r.error && <div className="bad run-err">{r.error}</div>}
      </div>
    ),
  },
];

export function ScriptSide({ tab, onTab, runResult, sandbox, heap, aliasGroups, runs, runsLoading }: Props) {
  const stdout = runResult?.stdout.trimEnd() ?? '';
  const stderr = runResult?.stderr.trimEnd() ?? '';
  const sandboxLogs = sandbox?.logs.join('\n') ?? '';

  // 输出面板：沙箱与 Node 两路的日志合在一处展示（谁跑的由 meta 行说明）
  const outputText = [
    sandboxLogs && `$ 沙箱日志\n${sandboxLogs}`,
    sandbox?.error && `$ 沙箱错误\n${sandbox.error}`,
    stdout && `$ stdout\n${stdout}`,
    stderr && `$ stderr\n${stderr}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const output = (
    <div className="script-output">
      {(runResult || sandbox) && (
        <div className="script-run-meta">
          {sandbox ? (
            <>
              <Badge status={sandbox.ok ? 'success' : 'error'} text={sandbox.ok ? '沙箱 ok' : '沙箱失败'} />
              <span className="muted mono">
                {sandbox.durationMs}ms · 上限 {sandbox.timeoutMs}ms/{sandbox.memoryMb}MB
                {sandbox.panels.length ? ` · 面板 ${sandbox.panels.join(', ')}` : ' · 未装面板'}
              </span>
            </>
          ) : (
            <>
              <Badge status={runResult?.code === 0 ? 'success' : 'error'} text={`退出码 ${runResult?.code}`} />
              <span className="muted mono">{runResult?.script}</span>
            </>
          )}
        </div>
      )}
      {outputText ? (
        <LogView text={outputText} />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行后在这里看输出（ANSI 着色 · 虚拟滚动）" />
      )}
    </div>
  );

  const heapPane = (
    <div className="script-heap">
      {!heap.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="变量堆为空——脚本里用 set(key, value)（沙箱）或面板导出放产出"
        />
      ) : (
        <>
          <div className="heap-head muted">
            共 {heap.length} 项 · Map / Set / 函数只报类型，不泄露地址与句柄
          </div>
          <Table
            size="small"
            rowKey="key"
            dataSource={heap}
            columns={heapColumns}
            pagination={false}
            scroll={{ y: 320 }}
          />
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

  const runsPane = (
    <div className="script-runs">
      <Table
        size="small"
        rowKey={(r) => r.at + r.source}
        dataSource={runs}
        columns={runColumns}
        loading={runsLoading}
        pagination={false}
        scroll={{ y: 320 }}
        locale={{ emptyText: '还没有运行记录' }}
      />
    </div>
  );

  return (
    <div className="card script-side">
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(k) => onTab(k as SideTab)}
        items={[
          { key: 'output', label: '输出', children: output },
          { key: 'heap', label: `变量堆${heap.length ? ` (${heap.length})` : ''}`, children: heapPane },
          { key: 'aliases', label: '内置函数', children: aliases },
          { key: 'runs', label: '台账', children: runsPane },
        ]}
      />
    </div>
  );
}
