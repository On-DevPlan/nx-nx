// 脚本工作台：列表 / 编辑 / 两条执行通道 / 新建 / 删除。
//
// 两条执行通道是这一版的核心区分（此前只有一条，短脚本也被扔进 Node 子进程）：
//   运行（Node）  真子进程：fs / 网络 / 面板里的 async 函数 —— 写业务脚本用
//   沙箱运行      QuickJS 虚拟机：无 fs / 无网络 / 有超时与内存上限 —— 跑片段、跑不可信逻辑
// 界面上按脚本类型只亮其中一个按钮，避免「点错了才发现跑不了」。
//
// 本文件只负责「怎么摆」；状态与动作在 use-workbench.ts。
import { Badge, Button, Card, Empty, Select, Space, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { CliHints } from '../../components/CliHints.js';
import { ScriptEditor, KindHeader } from './editor.js';
import { ScriptSide } from './side-panel.js';
import { useWorkbench } from './use-workbench.js';

export default function ScriptView() {
  const wb = useWorkbench();

  return (
    <div className="script-grid">
      <Card
        className="script-list"
        size="small"
        title="脚本"
        extra={
          <Space size={4}>
            <Badge count={wb.scripts.length} showZero color="#8b9096" />
            <Tooltip title="新建脚本">
              <Button size="small" icon={<PlusOutlined />} onClick={wb.create} disabled={wb.working} />
            </Tooltip>
          </Space>
        }
        styles={{ body: { padding: 0, overflow: 'auto', flex: 1, minHeight: 0 } }}
      >
        {wb.grouped.map(([kind, list]) => (
          <div key={kind}>
            <KindHeader kind={kind} count={list.length} />
            {list.map((s) => (
              <button
                key={s.name}
                className={'tpl-item' + (s.name === wb.selected ? ' active' : '')}
                onClick={() => wb.selectScript(s.name)}
              >
                <div className="tpl-name mono">{s.name}</div>
                <div className="tpl-desc muted">{s.description || '—'}</div>
              </button>
            ))}
          </div>
        ))}
        {!wb.scripts.length && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无脚本，点「新建」开始" style={{ margin: '24px 0' }} />
        )}
        <CliHints module="script" />
      </Card>

      <ScriptEditor
        selected={wb.selected}
        kind={wb.kind}
        path={wb.current?.path}
        content={wb.content}
        dirty={wb.dirty}
        busy={wb.busy}
        customName={wb.customName}
        customValue={wb.customValue}
        err={wb.err}
        params={wb.params}
        paramValues={wb.paramValues}
        onParamValue={(name, value) => wb.setParamValues((prev) => ({ ...prev, [name]: value }))}
        onContent={wb.setContent}
        onCustomName={wb.setCustomName}
        onCustomValue={wb.setCustomValue}
        onSave={wb.save}
        onRun={wb.run}
        onSandbox={wb.runSandbox}
        onDelete={wb.remove}
      />

      <div className="script-side-col">
        <div className="panel-bar">
          <span className="panel-bar-label">装载面板</span>
          <Select
            size="small"
            allowClear
            value={wb.panel || undefined}
            placeholder="不装面板"
            onChange={(v) => wb.setPanel(v ?? '')}
            options={wb.sharedPanels.map((s) => ({ value: s.name, label: s.name }))}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Tooltip title="刷新运行台账">
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => void wb.loadRuns()} />
          </Tooltip>
        </div>
        <ScriptSide
          tab={wb.tab}
          onTab={wb.setTab}
          runResult={wb.runResult}
          sandbox={wb.sandbox}
          heap={wb.heap}
          aliasGroups={wb.aliasGroups}
          runs={wb.runs}
          runsLoading={wb.runsLoading}
        />
      </div>
      {wb.dialogNode}
    </div>
  );
}
