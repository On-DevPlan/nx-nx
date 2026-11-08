// 脚本参数表单：把 `@param` 声明渲染成对应控件（文本 / 数字 / 开关 / 下拉）。
//
// 没有声明参数的脚本退回单行「自定义参数」输入框——两种形态共用同一个运行链路：
// 表单值先转成 `--k=v` token，再与自定义 token 拼接成 argv。
//
// 组件库：antd（token 见 components/theme.tsx）。
import { Input, InputNumber, Select, Switch, Tooltip } from 'antd';
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
            const label = (
              <span className="param-name mono">
                --{p.name}
              </span>
            );
            return (
              <div key={p.name} className="param-row" title={p.desc}>
                {p.type === 'boolean' ? (
                  <Tooltip title={p.desc || p.name}>
                    <span className="param-name mono">
                      {label}
                      <Switch
                        size="small"
                        checked={v === 'true'}
                        onChange={(c) => onValue(p.name, c ? 'true' : 'false')}
                      />
                    </span>
                  </Tooltip>
                ) : (
                  <Tooltip title={p.desc || p.name}>
                    <span className="param-name mono">{label}</span>
                  </Tooltip>
                )}
                {p.type === 'boolean' ? (
                  <span className="param-desc muted">{p.desc || ''}</span>
                ) : p.type === 'select' ? (
                  <Select
                    size="small"
                    value={v || undefined}
                    placeholder={p.default || ''}
                    onChange={(nv) => onValue(p.name, nv)}
                    options={(p.options ?? []).map((o) => ({ value: o, label: o }))}
                    style={{ flex: '1 1 auto', minWidth: 0 }}
                  />
                ) : p.type === 'number' ? (
                  <InputNumber
                    size="small"
                    value={v === '' ? undefined : Number(v)}
                    placeholder={p.default || ''}
                    onChange={(nv) => onValue(p.name, nv === null ? '' : String(nv))}
                    style={{ flex: '1 1 auto', minWidth: 0 }}
                  />
                ) : (
                  <Input
                    size="small"
                    value={v}
                    placeholder={p.default || ''}
                    onChange={(e) => onValue(p.name, e.target.value)}
                    style={{ flex: '1 1 auto', minWidth: 0 }}
                  />
                )}
                {p.type !== 'boolean' && p.desc && <span className="param-desc muted">{p.desc}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="script-args">
        <span className="muted">{params.length ? '额外参数' : '参数'}</span>
        <Input
          size="small"
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder={params.length ? '（可选）自由追加，例如 --dry' : '--root D:\\proj --dry'}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
