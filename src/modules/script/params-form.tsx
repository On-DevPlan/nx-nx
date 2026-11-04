// 脚本参数表单：把 `@param` 声明渲染成对应控件（文本 / 数字 / 开关 / 下拉）。
//
// 没有声明参数的脚本退回单行「自定义参数」输入框——两种形态共用同一个运行链路：
// 表单值先转成 `--k=v` token，再与自定义 token 拼接成 argv。
import type { ScriptParam } from '../../core/script/params.js';

interface Props {
  params: ScriptParam[];
  values: Record<string, string>;
  onValue: (name: string, value: string) => void;
  custom: string;
  onCustom: (v: string) => void;
}

export function ParamsForm({ params, values, onValue, custom, onCustom }: Props) {
  return (
    <div className="script-params">
      {params.length > 0 && (
        <div className="param-grid">
          {params.map((p) => {
            const v = values[p.name] ?? '';
            const id = `p-${p.name}`;
            return (
              <label key={p.name} className="param-row" htmlFor={id} title={p.desc}>
                <span className="param-name mono">
                  --{p.name}
                  {p.type === 'boolean' && (
                    <input
                      id={id}
                      type="checkbox"
                      className="param-check"
                      checked={v === 'true'}
                      onChange={(e) => onValue(p.name, e.target.checked ? 'true' : 'false')}
                    />
                  )}
                </span>
                {p.type === 'boolean' ? (
                  <span className="param-desc muted">{p.desc || ''}</span>
                ) : p.type === 'select' ? (
                  <select id={id} value={v} onChange={(e) => onValue(p.name, e.target.value)}>
                    {(p.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={p.type === 'number' ? 'number' : 'text'}
                    value={v}
                    placeholder={p.default || ''}
                    onChange={(e) => onValue(p.name, e.target.value)}
                  />
                )}
                {p.type !== 'boolean' && p.desc && <span className="param-desc muted">{p.desc}</span>}
              </label>
            );
          })}
        </div>
      )}
      <div className="script-args">
        <label className="muted" htmlFor="script-args">
          {params.length ? '额外参数' : '参数'}
        </label>
        <input
          id="script-args"
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder={params.length ? '（可选）自由追加，例如 --dry' : '--root D:\\proj --dry'}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
