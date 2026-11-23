// 脚本编辑器卡片：头部操作 + 参数表单 + CodeMirror + 文件信息。
//
// 编辑器从 textarea 换成 CodeMirror 6 的原因：
//   脚本是要写的东西，textarea 没有缩进、没有括号匹配、没有行号、出错也不标行——
//   用户只能「写完再猜」。CM6 这几样都是现成的，且体积按需（只装 js 语言包）。
//
// 组件库：antd + @uiw/react-codemirror（token 见 components/theme.tsx）。
import { Badge, Button, Tooltip } from 'antd';
import {
  DeleteOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { Copyable } from '../../components/ui.jsx';
import type { ScriptParam } from '../../../../core/script/params.js';
import type { ScriptInfo } from './helpers.js';
import { ParamsForm } from './params-form.js';

interface Props {
  selected: string | null;
  kind: ScriptInfo['kind'] | undefined;
  path?: string;
  content: string;
  dirty: boolean;
  busy: string | null;
  customName: string;
  customValue: string;
  err: string;
  params: ScriptParam[];
  paramValues: Record<string, string>;
  onParamValue: (name: string, value: string) => void;
  onContent: (v: string) => void;
  onCustomName: (v: string) => void;
  onCustomValue: (v: string) => void;
  onSave: () => void;
  onRun: () => void;
  onSandbox: () => void;
  onDelete: () => void;
}

const KIND_LABEL: Record<ScriptInfo['kind'], string> = {
  long: '长脚本 · Node',
  short: '短脚本 · 沙箱',
  shared: '共享面板',
};

export function ScriptEditor({
  selected,
  kind,
  path,
  content,
  dirty,
  busy,
  customName,
  customValue,
  err,
  params,
  paramValues,
  onParamValue,
  onContent,
  onCustomName,
  onCustomValue,
  onSave,
  onRun,
  onSandbox,
  onDelete,
}: Props) {
  const working = busy !== null;
  const isShort = kind === 'short';
  const isShared = kind === 'shared';
  const canRunNode = Boolean(selected) && !isShort && !isShared;
  const canRunSandbox = Boolean(selected) && isShort;

  return (
    <div className="card script-editor">
      <div className="colhead">
        <span className="mono editor-title">
          {selected ? `${selected}.mjs` : '脚本编辑器'}
          {kind && <Badge status={isShared ? 'warning' : 'default'} text={KIND_LABEL[kind]} />}
        </span>
        <span className="acts">
          {dirty && <Badge status="error" text="未保存" />}
          <Tooltip title="保存（Ctrl/Cmd+S）">
            <Button
              size="small"
              icon={<SaveOutlined />}
              onClick={onSave}
              disabled={!selected || !dirty || working}
            >
              保存
            </Button>
          </Tooltip>
          {/* 两个运行入口是互斥的：长脚本只能在 Node 里跑，短脚本只能在沙箱里跑。
              同时给两个按钮只会让人点错——所以按类型只亮一个。 */}
          {isShort ? (
            <Tooltip title="在沙箱（QuickJS）里跑：无 fs / 无网络 / 有超时与内存上限（Ctrl/Cmd+Enter）">
              <Button
                size="small"
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={onSandbox}
                disabled={!canRunSandbox || working}
              >
                {busy === 'sandbox' ? '沙箱运行中…' : '沙箱运行'}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip
              title={
                isShared
                  ? '共享面板只声明、不作入口；由服务组或沙箱装载'
                  : '在 Node 子进程里跑：可用 fs / 网络 / 面板里的 async 函数（Ctrl/Cmd+Enter）'
              }
            >
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={onRun}
                disabled={!canRunNode || working}
              >
                {busy === 'run' ? '运行中…' : '运行'}
              </Button>
            </Tooltip>
          )}
          <Tooltip title="删除脚本">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete} disabled={!selected || working} />
          </Tooltip>
        </span>
      </div>

      {err && <div className="empty bad">{err}</div>}
      {!selected && !err && <div className="empty">← 选一个脚本，或点左上角「新建」。</div>}

      {selected && (
        <>
          <ParamsForm
            params={params}
            values={paramValues}
            onValue={onParamValue}
            customName={customName}
            onCustomName={onCustomName}
            customValue={customValue}
            onCustomValue={onCustomValue}
          />
          <div className="cm-host">
            <CodeMirror
              value={content}
              height="100%"
              onChange={onContent}
              extensions={[javascript({ jsx: false, typescript: false })]}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                bracketMatching: true,
                autocompletion: false,
              }}
              placeholder="// 写点什么…"
            />
          </div>
          <div className="script-meta">
            <Copyable text={path || selected}>{path || selected}</Copyable>
            <span className="muted">
              {content.length} 字符 · {isShort ? '沙箱执行（无 fs / 无网络）' : '运行前自动保存'} · Ctrl/Cmd+S 保存 · Ctrl/Cmd+Enter 运行
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** 侧栏分组标题（长脚本 / 短脚本 / 面板）——列表按角色分区，不混在一起 */
export function KindHeader({ kind, count }: { kind: ScriptInfo['kind']; count: number }) {
  return (
    <div className="opt-group-head">
      <span>{KIND_LABEL[kind]}</span>
      <span className="opt-group-count">{count}</span>
    </div>
  );
}
