// 服务组状态卡：活性徽标 / 三个操作 / 运行态数字。
//
// 操作面刻意只有三个（这是第 1 轮验收反馈的硬要求）：
//   启动 · 关闭 · 自愈开关
// 其余能力（活性单测、日志、流水线）都还在，但降级成文本链接——
// 「跑流水线」是调试路径而不是日常运维动作，摆在主按钮区会让人以为它是第四个常态动作。
import { Badge, Button, Card, Popconfirm, Space, Statistic, Switch, Tooltip, Typography } from 'antd';
import { CaretRightOutlined, PoweroffOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { GroupView } from './types.js';

const { Paragraph, Text } = Typography;

export type SgAction = 'serviceGroup.start' | 'serviceGroup.stop' | 'serviceGroup.check' | 'serviceGroup.run';

interface Props {
  group: GroupView;
  working: boolean;
  onAction: (action: SgAction, id: string) => void;
  onAutoHeal: (id: string, on: boolean) => void;
  onShowLogs: (id: string) => void;
}

// 状态徽标：停 / 活 / 失活 —— 一眼看清「自愈是否生效」
function statusBadge(rt: GroupView['runtime']) {
  if (rt.status !== 'running') return <Badge status="default" text="已停止" />;
  if (rt.alive === false) return <Badge status="error" text="运行中 · 活性 FAIL" />;
  if (rt.alive === true) return <Badge status="success" text="运行中 · 活性 OK" />;
  return <Badge status="processing" text="运行中 · 未检测" />;
}

export function StatusCard({ group, working, onAction, onAutoHeal, onShowLogs }: Props) {
  const rt = group.runtime;
  const id = group.config.id;
  const running = rt.status === 'running';
  const hasHealth = !!group.config.health;
  const autoHeal = group.config.health?.onDead === 'restart';

  return (
    <Card
      size="small"
      // 头部允许换行：动作区在窄面板里会挤，换行后标题（组 id + 状态徽标）永远不会被压没。
      styles={{ header: { flexWrap: 'wrap', rowGap: 6 } }}
      title={
        <Space size={8} style={{ minWidth: 0 }}>
          <Text code>{id}</Text>
          {statusBadge(rt)}
        </Space>
      }
      extra={
        <Space size={8} wrap>
          {/* 启动 / 关闭：同一位置切换，避免两个按钮同时可点造成语义歧义 */}
          {running ? (
            <Popconfirm
              title={`关闭 ${id}？`}
              description={`按 stopMode=${group.config.stopMode} 执行`}
              okText="关闭"
              okButtonProps={{ danger: true }}
              onConfirm={() => onAction('serviceGroup.stop', id)}
              disabled={working}
            >
              <Button size="small" danger icon={<PoweroffOutlined />} disabled={working}>
                关闭
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<CaretRightOutlined />}
              disabled={working}
              onClick={() => onAction('serviceGroup.start', id)}
            >
              启动
            </Button>
          )}
          {/* 自愈开关：没有探活就没有自愈可开关，所以禁用并说明原因 */}
          <Tooltip title={hasHealth ? '失活后是否自动重启（关掉后只记录，监控照跑）' : '先配置活性检测，才有失活可自愈'}>
            <Space size={4}>
              <Switch
                size="small"
                checked={autoHeal}
                disabled={working || !hasHealth}
                onChange={(v) => onAutoHeal(id, v)}
              />
              <span className="muted">自愈</span>
            </Space>
          </Tooltip>
        </Space>
      }
    >
      <div className="sg-stats">
        <Statistic title="状态" value={running ? '运行中' : '已停止'} valueStyle={{ fontSize: 14 }} />
        <Statistic title="PID" value={rt.pid ?? '-'} valueStyle={{ fontSize: 14 }} />
        <Statistic
          title="自愈次数"
          value={rt.restarts}
          valueStyle={{ fontSize: 14, color: rt.restarts > 0 ? '#b3261e' : undefined }}
        />
        <Statistic
          title="连续失败"
          value={rt.failStreak}
          valueStyle={{ fontSize: 14, color: rt.failStreak > 0 ? '#b3261e' : undefined }}
        />
      </div>
      {rt.detail && (
        <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {rt.detail}
        </Paragraph>
      )}
      {rt.lastEvent && (
        <Paragraph type="secondary" style={{ margin: '2px 0 0', fontSize: 11 }}>
          最近事件：{rt.lastEvent}
        </Paragraph>
      )}
      {rt.logFile && (
        <Paragraph type="secondary" style={{ margin: '2px 0 0', fontSize: 11 }} className="mono">
          日志：{rt.logFile}
        </Paragraph>
      )}
      {/* 调试入口做成命令链接而不是按钮：既不挤占卡片，
          又把「这个操作在命令行怎么写」直接摆出来——自动化时照抄即可。 */}
      <div className="sg-links">
        <button type="button" onClick={() => onAction('serviceGroup.check', id)} disabled={working}>
          sg check
        </button>
        <button type="button" onClick={() => onShowLogs(id)}>
          sg logs
        </button>
        <button type="button" onClick={() => onAction('serviceGroup.run', id)} disabled={working}>
          <ThunderboltOutlined /> sg run（流水线）
        </button>
      </div>
    </Card>
  );
}
