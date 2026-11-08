// 服务组状态卡：活性徽标 / 统计条 / 启停动作。
//
// 从 view.tsx 拆出来（单文件 300 行上限）：状态卡自成一体——
// 「现在这个服务是活的还是死的、自愈过几次、下一步按哪个钮」都在这一张卡里。
import { Badge, Button, Card, Space, Statistic, Tooltip, Typography } from 'antd';
import {
  CaretRightOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { GroupView } from './types.js';

const { Paragraph, Text } = Typography;

export type SgAction = 'serviceGroup.start' | 'serviceGroup.stop' | 'serviceGroup.check' | 'serviceGroup.run';

interface Props {
  group: GroupView;
  working: boolean;
  onAction: (action: SgAction, id: string) => void;
}

// 状态徽标：停 / 活 / 失活 —— 一眼看清「自愈是否生效」
function statusBadge(rt: GroupView['runtime']) {
  if (rt.status !== 'running') return <Badge status="default" text="已停止" />;
  if (rt.alive === false) return <Badge status="error" text="运行中 · 活性 FAIL" />;
  if (rt.alive === true) return <Badge status="success" text="运行中 · 活性 OK" />;
  return <Badge status="processing" text="运行中 · 未检测" />;
}

export function StatusCard({ group, working, onAction }: Props) {
  const rt = group.runtime;
  const id = group.config.id;
  return (
    <Card
      size="small"
      // 头部允许换行：四个动作按钮 + 标题在窄面板里会互相挤，
      // 换行后标题（组 id + 状态徽标）永远不会被按钮压没。
      styles={{ header: { flexWrap: 'wrap', rowGap: 6 } }}
      title={
        <Space size={8} style={{ minWidth: 0 }}>
          <Text code>{id}</Text>
          {statusBadge(rt)}
        </Space>
      }
      extra={
        <Space size={4} wrap>
          <Tooltip title="启动主脚本（幂等：已在运行则跳过）">
            <Button
              size="small"
              icon={<CaretRightOutlined />}
              disabled={working}
              onClick={() => onAction('serviceGroup.start', id)}
            >
              启动
            </Button>
          </Tooltip>
          <Tooltip title="停止：关停脚本 → 杀端口 → 杀 pid">
            <Button size="small" disabled={working} onClick={() => onAction('serviceGroup.stop', id)}>
              停止
            </Button>
          </Tooltip>
          <Tooltip title="立即执行一次活性检测">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={working}
              onClick={() => onAction('serviceGroup.check', id)}
            >
              活性检测
            </Button>
          </Tooltip>
          <Tooltip title="流水线：启动 main → 等活性就绪 → client 依次执行">
            <Button
              size="small"
              type="primary"
              icon={<ThunderboltOutlined />}
              disabled={working}
              onClick={() => onAction('serviceGroup.run', id)}
            >
              跑流水线
            </Button>
          </Tooltip>
        </Space>
      }
    >
      <div className="sg-stats">
        <Statistic
          title="状态"
          value={rt.status === 'running' ? '运行中' : '已停止'}
          valueStyle={{ fontSize: 14 }}
        />
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
    </Card>
  );
}
