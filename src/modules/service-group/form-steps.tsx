// 流水线步骤编辑器（从 form.tsx 拆出：单文件 300 行上限）。
//
// 为什么是「可排序步骤」而不是多选框：流水线的执行顺序就是配置顺序，
// 多选框表达不了顺序，用户只能靠勾选先后猜——那就等于没有流水线。
import { Button, Empty, Form, Select, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

interface Props {
  clients: string[];
  entryScripts: { name: string }[];
  setClients: (next: string[]) => void;
  toggleClient: (name: string) => void;
  onCreateClient?: () => void;
}

export function StepsField({ clients, entryScripts, setClients, toggleClient, onCreateClient }: Props) {
  const move = (index: number, delta: number) => {
    const next = [...clients];
    const target = index + delta;
    const cur = next[index];
    const other = next[target];
    // 越界或元素缺失（理论上不会发生）时直接不动——数组里没有的项不该被搬动
    if (cur === undefined || other === undefined || target < 0 || target >= next.length) return;
    next[index] = other;
    next[target] = cur;
    setClients(next);
  };

  return (
    <Form.Item
      label={`client 步骤（${clients.length} 个）`}
      extra="顺序即执行顺序；这里只放 client，不放服务的启动/停止/探活脚本。"
    >
      {clients.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没选脚本" style={{ margin: '8px 0' }} />
      ) : (
        <div className="sg-steps">
          {clients.map((c, i) => (
            <div key={c} className="sg-step">
              <Tag color="#8b9096">{i + 1}</Tag>
              <span className="mono sg-step-name">{c}</span>
              <Space size={2} style={{ marginLeft: 'auto' }}>
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowUpOutlined />}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`上移 ${c}`}
                />
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowDownOutlined />}
                  disabled={i === clients.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`下移 ${c}`}
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => toggleClient(c)}
                  aria-label={`移除 ${c}`}
                />
              </Space>
            </div>
          ))}
        </div>
      )}
      <Select
        mode="multiple"
        placeholder="添加 client…"
        value={[]}
        onChange={(v) => v.forEach((n) => toggleClient(n))}
        style={{ width: '100%', marginTop: 6 }}
        options={entryScripts.filter((s) => !clients.includes(s.name)).map((s) => ({ value: s.name, label: s.name }))}
      />
      {onCreateClient && (
        <Button size="small" type="link" icon={<PlusOutlined />} onClick={onCreateClient} style={{ paddingLeft: 0 }}>
          新建 client 脚本（写入当前服务组命名空间）
        </Button>
      )}
    </Form.Item>
  );
}
