// 脚本编辑器卡片：头部操作 + 参数表单 + 代码 textarea + 文件信息。
//
// 组件库：antd（token 见 components/theme.tsx）。
import { Badge, Button, Tooltip } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { Copyable } from '../../web/frontend/components/ui.jsx';
import type { ScriptParam } from '../../core/script/params.js';
import { ParamsForm } from './params-form.js';

interface Props {
  selected: string | null;
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
  canRun: boolean;
  onDelete: () => void;
}

export function ScriptEditor({
  selected,
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
  canRun,
  onDelete,
}: Props) {
  const working = busy !== null;
  return (
    <div className="card script-editor">
      <div className="colhead">
        <span className="mono">{selected ? `${selected}.mjs` : '脚本编辑器'}</span>
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
          <Tooltip
            title={canRun ? '运行（Ctrl/Cmd+Enter）' : '共享面板不可直接运行（由服务组脚本自动装载）'}
          >
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onRun}
              disabled={!selected || working || !canRun}
            >
              {busy === 'run' ? '运行中…' : '运行'}
            </Button>
          </Tooltip>
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
          <textarea
            className="code-editor"
            value={content}
            onChange={(e) => onContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return;
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              onContent(content.slice(0, start) + '  ' + content.slice(end));
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 2;
              });
            }}
            spellCheck={false}
          />
          <div className="script-meta">
            <Copyable text={path || selected}>{path || selected}</Copyable>
            <span className="muted">
              {content.length} 字符 · 运行前自动保存 · Ctrl/Cmd+S 保存 · Ctrl/Cmd+Enter 运行
            </span>
          </div>
        </>
      )}
    </div>
  );
}
