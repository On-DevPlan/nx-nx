// 管理空间的配置区（从 form.tsx 拆出：单文件 300 行上限）。
//
// 空间配置只两件事：
//   panel —— 空间面板脚本（留空则沿用「共享面板」）
//   check —— 空间里那个返回 bool 的方法名；执行 server 之前先调它
//
// 为什么要单独一个文件：form.tsx 已经贴着 300 行上限，
// 而空间这块还会继续长（将来要加钩子、状态视图），塞在主表单里只会互相挤。
import { Form, Input, Select, Space, Switch } from 'antd';
import type { FormState } from './form.js';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  panelScripts: { name: string }[];
  shared: string;
}

export function SpaceField({ form, set, panelScripts, shared }: Props) {
  return (
    <Form.Item
      label="管理空间（装载面板成为可管理的空间；check 方法在执行 server 前先跑）"
      extra="check 方法须返回 bool：返回 false 时流水线不启动主脚本（依赖没就绪就别起）。"
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space size={8}>
          <Switch checked={form.spaceEnabled} onChange={(v) => set('spaceEnabled', v)} />
          <span className="muted">启用管理空间</span>
        </Space>
        {form.spaceEnabled && (
          <Space.Compact style={{ width: '100%' }}>
            <Select
              value={form.spacePanel || undefined}
              placeholder={shared ? `（沿用共享面板 ${shared}）` : '选择空间面板…'}
              onChange={(v) => set('spacePanel', v ?? '')}
              style={{ width: '50%' }}
              options={[
                {
                  value: '',
                  label: shared ? `（沿用共享面板 ${shared}）` : '（未选）',
                },
                ...panelScripts.map((s) => ({ value: s.name, label: s.name })),
              ]}
            />
            <Input
              value={form.spaceCheck}
              onChange={(e) => set('spaceCheck', e.target.value)}
              placeholder="checkUp"
            />
          </Space.Compact>
        )}
      </Space>
    </Form.Item>
  );
}
