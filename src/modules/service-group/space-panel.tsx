// 管理空间面板：展示空间的方法清单与状态堆。
//
// 「启动按钮对应一段管理空间」——空间要能被看见：方法清单告诉你「它能干什么」，
// 状态堆告诉你「它现在是什么状态」。
//
// 刻意不提供「逐方法调用」按钮：
//   方法调用是自动化与调试的高频动作，逐个铺按钮既挤又慢；
//   等价命令（nx-nx sg space-call <组> --method <名>）就写在每一行旁边，照抄即可。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useStore } from '../../web/frontend/store.js';

const { Text } = Typography;

interface SpaceMethod {
  name: string;
  arity: number;
  async: boolean;
}

interface SpaceFrame {
  method: string;
  at: string;
  resultType: string | null;
  error: string | null;
}

interface SpaceView {
  ok: boolean;
  error?: string;
  methods?: SpaceMethod[];
  heap?: { key: string; describe: string; type: string }[];
  frames?: SpaceFrame[];
}

interface Props {
  groupId: string | null;
}

export function SpacePanel({ groupId }: Props) {
  const { client } = useStore();
  const [view, setView] = useState<SpaceView | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const r = await client['serviceGroup.space']({ id: groupId });
      setView(r as unknown as SpaceView);
    } catch (e: unknown) {
      setView({ ok: false, error: String((e as { message?: string })?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [client, groupId]);

  useEffect(() => {
    setView(null);
    void load();
  }, [load]);

  if (!groupId) return null;

  return (
    <Card
      size="small"
      title="管理空间"
      extra={
        <Tooltip title="刷新空间视图（空间常驻：状态与调用记录跨刷新保留）">
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading} />
        </Tooltip>
      }
    >
      {loading && !view ? (
        <Spin size="small" />
      ) : !view ? null : !view.ok ? (
        <Alert type="info" message={view.error ?? '空间装载失败'} showIcon />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            方法（{view.methods?.length ?? 0}）· 调用：sg space-call {groupId} --method &lt;名字&gt;
          </Text>
          {(view.methods?.length ?? 0) === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="空间还没有方法：在面板里挂 globalThis.xxx = function () {}，或用 defineSpace({ methods })"
              style={{ margin: '8px 0' }}
            />
          ) : (
            <div className="sg-steps">
              {view.methods?.map((m) => (
                <div key={m.name} className="sg-step">
                  <Tag color="#8b9096">fn</Tag>
                  <span className="mono sg-step-name">
                    {m.name}({m.arity})
                  </span>
                  {m.async && <Badge status="processing" text="async" />}
                </div>
              ))}
            </div>
          )}

          {view.heap && view.heap.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                状态（只显示可 JSON 表示的部分）
              </Text>
              <pre className="mono sg-log-pre" style={{ maxHeight: 160, overflow: 'auto' }}>
                {view.heap.map((h) => `${h.key}: ${h.describe}`).join('\n')}
              </pre>
            </div>
          )}

          {/* 调用栈：空间被调用过的痕迹（空间常驻，这些记录跨刷新保留） */}
          {view.frames && view.frames.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                最近调用（{view.frames.length}）
              </Text>
              <div className="sg-steps">
                {view.frames
                  .slice(-5)
                  .reverse()
                  .map((f, i) => (
                    <div key={`${f.at}-${i}`} className="sg-step">
                      <Tag color="#8b9096">call</Tag>
                      <span className="mono sg-step-name">{f.method}</span>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {String(f.at).slice(11, 19)} → {f.resultType ?? f.error ?? '?'}
                      </Text>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Space>
      )}
    </Card>
  );
}
