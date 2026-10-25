// 脚本编辑器卡片：头部操作 + 参数 + 代码 textarea + 文件信息。
import { Copyable } from '../../web/frontend/components/ui.jsx';

interface Props {
  selected: string | null;
  path?: string;
  content: string;
  dirty: boolean;
  busy: string | null;
  args: string;
  err: string;
  onContent: (v: string) => void;
  onArgs: (v: string) => void;
  onSave: () => void;
  onRun: () => void;
  onDelete: () => void;
}

export function ScriptEditor({
  selected,
  path,
  content,
  dirty,
  busy,
  args,
  err,
  onContent,
  onArgs,
  onSave,
  onRun,
  onDelete,
}: Props) {
  const working = busy !== null;
  return (
    <div className="card script-editor">
      <div className="colhead">
        <span className="mono">{selected ? `${selected}.mjs` : '脚本编辑器'}</span>
        <span className="acts">
          {dirty && <span className="tag bad">未保存</span>}
          <button className="btn small" onClick={onSave} disabled={!selected || !dirty || working}>
            保存
          </button>
          <button className="btn small" onClick={onRun} disabled={!selected || working}>
            {busy === 'run' ? '运行中…' : '运行'}
          </button>
          <button className="btn small danger" onClick={onDelete} disabled={!selected || working}>
            删除
          </button>
        </span>
      </div>

      {err && <div className="empty bad">{err}</div>}
      {!selected && !err && <div className="empty">← 选一个脚本，或点左上角「新建」。</div>}

      {selected && (
        <>
          <div className="script-args">
            <label className="muted" htmlFor="script-args">
              参数
            </label>
            <input
              id="script-args"
              value={args}
              onChange={(e) => onArgs(e.target.value)}
              placeholder="--root D:\code\a_js\proj --dry"
              spellCheck={false}
            />
          </div>
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
