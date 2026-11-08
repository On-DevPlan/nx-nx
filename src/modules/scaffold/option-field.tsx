// 单个选项的控件渲染：按 type 选控件，必填/选填的标记**只在这里出一份**。
//
// 此前必填的红色星号只画在 string/number 上，enum 与 boolean 完全没有标记——
// 同一份 schema 在面板上有两种读法，用户只能猜哪个是真必填。现在三种控件共用
// 同一个 FieldBadge，选填一律带「选填」徽标，必填一律带 *，与分组标题互为印证。
//
// 组件库：antd（token 见 components/theme.tsx）。
import { Input, InputNumber, Select, Switch } from 'antd';
import type { OptionSpec } from '../../core/templates.js';
import { optionLabel, validateOption } from './option-form.js';

function FieldBadge({ opt }: { opt: OptionSpec }) {
  return opt.required ? (
    <span className="req" title="必填">*</span>
  ) : (
    <span className="opt-badge">选填</span>
  );
}

export function OptionField({
  opt,
  value,
  onChange,
}: {
  opt: OptionSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = optionLabel(opt);
  const err = validateOption(opt, value);

  // 行内只报格式错（留空不报）；缺必填由分组标题 + 底部阻塞提示负责
  const footer = (
    <>
      {opt.hint ? <div className="opt-hint">{opt.hint}</div> : null}
      {err ? <div className="opt-hint bad">{err}</div> : null}
    </>
  );

  if (opt.type === 'boolean') {
    return (
      <div className="opt-row">
        <label className="opt-label" htmlFor={`opt-${opt.name}`}>
          <Switch
            size="small"
            id={`opt-${opt.name}`}
            checked={!!value}
            onChange={(v) => onChange(v)}
          />
          <span>{label}</span>
          <FieldBadge opt={opt} />
        </label>
        {footer}
      </div>
    );
  }

  if (opt.type === 'enum') {
    return (
      <div className="opt-row">
        <label className="opt-label" htmlFor={`opt-${opt.name}`}>
          {label}
          <FieldBadge opt={opt} />
        </label>
        <Select
          size="small"
          id={`opt-${opt.name}`}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          options={(opt.values || []).map((v) => ({ value: v, label: v }))}
          style={{ width: '100%' }}
        />
        {footer}
      </div>
    );
  }

  return (
    <div className="opt-row">
      <label className="opt-label" htmlFor={`opt-${opt.name}`}>
        {label}
        <FieldBadge opt={opt} />
      </label>
      {opt.type === 'number' ? (
        <InputNumber
          size="small"
          id={`opt-${opt.name}`}
          value={value === '' || value === undefined || value === null ? undefined : Number(value)}
          placeholder={opt.default != null ? String(opt.default) : ''}
          onChange={(v) => onChange(v === null ? '' : String(v))}
          style={{ width: '100%' }}
        />
      ) : (
        <Input
          size="small"
          id={`opt-${opt.name}`}
          value={String(value ?? '')}
          placeholder={opt.default != null ? String(opt.default) : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {footer}
    </div>
  );
}
