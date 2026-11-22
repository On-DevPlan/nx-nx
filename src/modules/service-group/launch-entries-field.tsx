// 启动脚本列表编辑器：每一行就是一套完整启动方式（脚本 / 参数 / 环境 / 端口）。
//
// 这里刻意不再声明「参数类型 / 默认值 / 表单控件」——启动时没有表单，
// 用户只需在首页从这张列表里选一个版本，再确认启动。
import { Button, Input, InputNumber, Select, Space, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { LaunchEntryForm } from './form.js';

interface Props {
  entries: LaunchEntryForm[];
  entryScripts: { name: string }[];
  setEntries: (next: LaunchEntryForm[]) => void;
}

function blank(index: number): LaunchEntryForm {
  return {
    name: `版本 ${index}`,
    script: '',
    argsText: '',
    envText: '',
    port: '',
    desc: '',
  };
}

export function LaunchEntriesField({ entries, entryScripts, setEntries }: Props) {
  const patch = (i: number, part: Partial<LaunchEntryForm>) => {
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...part } : e)));
  };

  const move = (i: number, delta: number) => {
    const next = [...entries];
    const to = i + delta;
    if (to < 0 || to >= next.length) return;
    const a = next[i];
    const b = next[to];
    if (!a || !b) return;
    next[i] = b;
    next[to] = a;
    setEntries(next);
  };

  const add = () => setEntries([...entries, blank(entries.length + 1)]);

  return (
    <div className="sg-launch-field">
      <div className="sg-launch-field-label">启动脚本列表（按不同版本启动）</div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        每条就是一套完整命令：脚本可选（留空沿用主脚本）、参数原样追加、环境变量注入、端口驱动探活与停止。
        启动前只在首页选一条，不再输入参数。
      </Typography.Paragraph>
      {entries.length === 0 ? (
        <div className="muted" style={{ padding: '8px 0' }}>
          还没有启动脚本：首页「启动」直接按主脚本参数起。点「添加启动脚本」可以做多版本。
        </div>
      ) : (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {entries.map((e, i) => (
            <div className="sg-launch-entry" key={i}>
              <div className="sg-launch-entry-head">
                {i === 0 && <Tag color="blue">默认</Tag>}
                <Input
                  value={e.name}
                  onChange={(ev) => patch(i, { name: ev.target.value })}
                  placeholder="版本名，如 默认 / 预发 / 生产"
                  style={{ width: 220 }}
                />
                <Space size={2} style={{ marginLeft: 'auto' }}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={i === 0}
                    aria-label={`上移 ${e.name}`}
                    onClick={() => move(i, -1)}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={i === entries.length - 1}
                    aria-label={`下移 ${e.name}`}
                    onClick={() => move(i, 1)}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除 ${e.name}`}
                    onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}
                  />
                </Space>
              </div>
              <Space wrap size={6} style={{ width: '100%' }}>
                <Select
                  value={e.script || undefined}
                  onChange={(v) => patch(i, { script: v ?? '' })}
                  allowClear
                  showSearch
                  placeholder="脚本（留空沿用主脚本）"
                  style={{ width: 220 }}
                  options={entryScripts.map((s) => ({ value: s.name, label: s.name }))}
                />
                <Input
                  value={e.argsText}
                  onChange={(ev) => patch(i, { argsText: ev.target.value })}
                  placeholder="参数：--port 18081 --config config/staging.json"
                  className="mono"
                  style={{ width: 360 }}
                />
                <InputNumber
                  value={e.port ? Number(e.port) : undefined}
                  onChange={(v) => patch(i, { port: v == null ? '' : String(v) })}
                  placeholder="端口（可留空）"
                  min={1}
                  max={65535}
                  style={{ width: 140 }}
                />
              </Space>
              <Input.TextArea
                value={e.envText}
                onChange={(ev) => patch(i, { envText: ev.target.value })}
                placeholder="环境变量，一行一个：NODE_ENV=staging"
                className="mono"
                autoSize={{ minRows: 1, maxRows: 3 }}
                style={{ marginTop: 6 }}
              />
              <Input
                value={e.desc}
                onChange={(ev) => patch(i, { desc: ev.target.value })}
                placeholder="一句话说明（可留空）"
                style={{ marginTop: 6 }}
              />
            </div>
          ))}
        </Space>
      )}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={add} style={{ marginTop: 8 }}>
        添加启动脚本
      </Button>
    </div>
  );
}
