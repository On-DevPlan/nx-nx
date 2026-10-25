// 脚本工作台右侧：运行输出 / 内置函数清单。
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

  return (
    <div className="card script-side">
      <div className="colhead">
        <span>输出 / 内置函数</span>
        <span className="acts">
          <button
            className={'btn small' + (tab === 'output' ? '' : ' ghost')}
            onClick={() => onTab('output')}
          >
            输出
          </button>
          <button
            className={'btn small' + (tab === 'aliases' ? '' : ' ghost')}
            onClick={() => onTab('aliases')}
          >
            内置函数
          </button>
        </span>
      </div>

      {tab === 'output' ? (
        <div className="script-output">
          {!runResult && <div className="empty">运行后在这里看标准输出与错误。</div>}
          {runResult && (
            <>
              <div className="script-run-meta">
                <span className={'tag' + (runResult.code === 0 ? '' : ' bad')}>
                  退出码 {runResult.code}
                </span>
                <span className="muted mono">{runResult.script}</span>
              </div>
              {stdout && <pre className="script-stdout">{stdout}</pre>}
              {stderr && <pre className="script-stderr">{stderr}</pre>}
              {!stdout && !stderr && <div className="empty">（无输出）</div>}
            </>
          )}
        </div>
      ) : (
        <div className="script-aliases">
          {!aliasGroups.length && <div className="empty">暂无内置函数</div>}
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
      )}
    </div>
  );
}
