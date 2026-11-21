// 启动参数编辑器：一个服务可以按不同「版本」启动——端口 / 配置文件 / 环境变量。
//
// 每个参数声明四件事：面板上显示成什么控件（type）、启动时传给主脚本的 flag（arg）、
// 注入的环境变量名（env）、以及默认值。启动弹窗只认这份声明，不在前端猜字段。
import { Button, Form, Input, Select, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { LaunchParam, LaunchProfile } from './types.js';

interface Props {
  params: LaunchParam[];
  profiles: LaunchProfile[];
  setParams: (next: LaunchParam[]) => void;
}

const TYPES = [
  { value: 'text', label: '文本输入' },
  { value: 'number', label: '数字输入' },
  { value: 'select', label: '下拉列表' },
] as const;

export function LaunchField({ params, profiles, setParams }: Props) {
  const patch = (i: number, part: Partial<LaunchParam>) => {
    setParams(params.map((p, idx) => (idx === i ? { ...p, ...part } : p)));
  };

  const add = () => {
    let i = params.length + 1;
    while (params.some((p) => p.key === `param${i}`)) i++;
    setParams([
      ...params,
      { key: `param${i}`, label: `参数 ${i}`, type: 'text', arg: `param${i}`, placeholder: '' },
    ]);
  };

  return (
    <Form layout="vertical" size="small">
      <Form.Item
        label="启动参数（启动前会弹出表单，可填端口 / 配置文件 / 环境）"
        extra="type=下拉列表时用 options 填候选值；arg=追加成 --arg value；env=注入同名环境变量。"
      >
        {params.length === 0 ? (
          <div className="muted" style={{ padding: '8px 0' }}>
            还没有启动参数：点「添加参数」后，首页启动会先弹出参数表单。
          </div>
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {params.map((p, i) => (
              <div className="sg-launch-param" key={p.key + i}>
                <Space wrap size={6} style={{ width: '100%' }}>
                  <Input
                    value={p.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder="显示名，如 端口"
                    style={{ width: 150 }}
                  />
                  <Input
                    value={p.key}
                    onChange={(e) => patch(i, { key: e.target.value })}
                    placeholder="键名，如 port"
                    className="mono"
                    style={{ width: 130 }}
                  />
                  <Select
                    value={p.type}
                    onChange={(v) => patch(i, { type: v })}
                    options={TYPES as unknown as { value: string; label: string }[]}
                    style={{ width: 120 }}
                  />
                  <Input
                    value={p.default ?? ''}
                    onChange={(e) => patch(i, { default: e.target.value })}
                    placeholder="默认值"
                    style={{ width: 150 }}
                  />
                  <Input
                    value={p.arg ?? ''}
                    onChange={(e) => patch(i, { arg: e.target.value })}
                    addonBefore={p.arg ? '--' : undefined}
                    placeholder={p.arg ? 'flag' : 'flag（可留空）'}
                    style={{ width: 130 }}
                  />
                  <Input
                    value={p.env ?? ''}
                    onChange={(e) => patch(i, { env: e.target.value })}
                    placeholder="环境变量名"
                    style={{ width: 150 }}
                  />
                  <Button
                    size="small"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label={`删除参数 ${p.label}`}
                    onClick={() => setParams(params.filter((_, idx) => idx !== i))}
                  />
                </Space>
                {p.type === 'select' && (
                  <Input
                    value={(p.options ?? []).join(', ')}
                    onChange={(e) =>
                      patch(i, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="下拉候选值，逗号分隔：development, staging, production"
                    style={{ marginTop: 6 }}
                  />
                )}
              </div>
            ))}
          </Space>
        )}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={add} style={{ marginTop: 8 }}>
          添加参数
        </Button>
      </Form.Item>

      {profiles.length > 0 && (
        <Form.Item label="模板预设（首页启动弹窗可直接选）">
          {profiles.map((p) => (
            <Tag key={p.name}>{p.name}</Tag>
          ))}
          <span className="muted">预设值可在启动弹窗里改，不会覆盖这里。</span>
        </Form.Item>
      )}
    </Form>
  );
}
