// 脚本参数表单：把 `@param` 声明渲染成对应控件（文本 / 数字 / 开关 / 下拉）。
//
// 界面原则：用户填的是**值**，不是命令行 token。
//   --port 18999 这种 CLI 形态是给终端用的；Web 上让人手打「--」开头的串，
//   既莫名其妙（这不是 shell），也容易和真实值里的短横线撞车。
//   所以标签只显示参数名与说明，token 拼装交给 paramTokens（core/script/params.ts）。
//
// 没声明参数的脚本退回单行「自定义参数」输入框——那种情况用户只能自己拼，
// 但也仍然按「值」的方式给（比如 "D:\proj"），不要求用户懂 -- 语法。
//
// 组件库：antd（token 见 components/theme.tsx）。
import { Input, InputNumber, Select, Switch, Tooltip } from 'antd';
import type { ScriptParam } from '../../core/script/params.js';

interface Props {
  params: ScriptParam[];
  values: Record<string, string>;
  onValue: (name: string, value: string) => void;
  customName: string;
  onCustomName: (v: string) => void;
  customValue: string;
  onCustomValue: (v: string) => void;
}

export function ParamsForm({
  params,
  values,
  onValue,
  customName,
  onCustomName,
  customValue,
  onCustomValue,
}: Props) {
  return (
    <div className="script-params">
      {params.length > 0 && (
        <div className="param-grid">
          {params.map((p) => {
            const v = values[p.name] ?? '';
            const label = (
              <span className="param-name">
                {p.name}
                {p.type !== 'boolean' && p.desc && <span className="muted"> · {p.desc}</span>}
              </span>
            );
            return (
              <div key={p.name} className="param-row" title={p.desc}>
                {p.type === 'boolean' ? (
                  <Tooltip title={p.desc || p.name}>
                    <span className="param-name">
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
                    <span className="param-name">{label}</span>
                  </Tooltip>
                )}
                {p.type === 'boolean' ? null : p.type === 'select' ? (
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
              </div>
            );
          })}
        </div>
      )}
      {/* 自定义参数：名字 + 值两段，用户不必知道脚本内部的 flag 语法。
          名字留空 = 位置参数；填名字 = 传给脚本的同名参数。 */}
      <div className="script-args">
        <Input
          size="small"
          value={customName}
          onChange={(e) => onCustomName(e.target.value)}
          placeholder="参数名（可留空）"
          style={{ width: 160 }}
        />
        <Input
          size="small"
          value={customValue}
          onChange={(e) => onCustomValue(e.target.value)}
          placeholder={params.length ? '参数值（可留空）' : '参数值，例如 D:\\proj'}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
