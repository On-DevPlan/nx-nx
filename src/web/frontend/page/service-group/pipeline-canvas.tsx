// 流水线画布：把「启动 → 探活 → client 步骤」画成一张图。
//
// 为什么用画布而不是列表：
//   流水线是一串有先后、会分叉（探活失败就回去重启）的动作。
//   列表只能表达「顺序」，画布能同时表达顺序、当前卡在哪、以及失败会回到哪一步。
//
// 节点状态取自运行态（status / alive / failStreak），所以这张图不是静态示意图——
// 服务一起一停，节点颜色跟着变。
import { useMemo } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GroupView } from '../../../../core/service/store.js';

interface Props {
  group: GroupView;
}

type Phase = 'idle' | 'ok' | 'bad';

// 节点配色：绿=就绪、红=失活/失败、灰=未启用。与状态徽标同一套语义。
const COLORS: Record<Phase, { border: string; bg: string }> = {
  ok: { border: '#2f9e44', bg: '#f2fbf4' },
  bad: { border: '#b3261e', bg: '#fdf3f2' },
  idle: { border: '#c9ccd1', bg: '#fbfbfc' },
};

function node(id: string, x: number, y: number, title: string, sub: string, phase: Phase): Node {
  return {
    id,
    position: { x, y },
    data: { label: `${title}\n${sub}` },
    // 自绘节点体：默认节点装不下「标题 + 副标题」两行，也不好上状态色
    type: 'default',
    style: {
      width: 168,
      padding: '8px 10px',
      fontSize: 11,
      lineHeight: 1.5,
      whiteSpace: 'pre-line',
      borderRadius: 6,
      border: `1px solid ${COLORS[phase].border}`,
      background: COLORS[phase].bg,
      color: '#14161a',
      fontWeight: 500,
    },
    draggable: false,
  };
}

export function PipelineCanvas({ group }: Props) {
  const { config, runtime } = group;
  const running = runtime.status === 'running';
  const alive = runtime.alive;

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = [];
    const es: Edge[] = [];

    const mainPhase: Phase = !running ? 'idle' : alive === false ? 'bad' : 'ok';
    ns.push(
      node(
        'main',
        0,
        0,
        '启动 · main',
        config.main ? config.main.script : '（未配置主脚本）',
        config.main ? mainPhase : 'idle',
      ),
    );

    let prev = 'main';
    if (config.health) {
      const h = config.health;
      const healthPhase: Phase = !running ? 'idle' : alive === false ? 'bad' : 'ok';
      ns.push(
        node(
          'health',
          230,
          0,
          '探活',
          `${h.kind === 'http' ? `${h.host}:${h.port}${h.path}` : `${h.host}:${h.port}`}\n每 ${h.intervalMs}ms · 连失 ${h.failThreshold} 次判死`,
          healthPhase,
        ),
      );
      es.push({ id: 'e-main-health', source: 'main', target: 'health', animated: running });
      prev = 'health';
    }

    config.clients.forEach((c, i) => {
      const id = `c${i}`;
      ns.push(node(id, 230 + (i + 1) * 230, 0, `步骤 ${i + 1}`, c, running ? 'ok' : 'idle'));
      es.push({ id: `e-${prev}-${id}`, source: prev, target: id });
      prev = id;
    });

    if (!config.clients.length) {
      ns.push(node('done', 230 + 230, 0, '完成', '无 client 步骤', 'idle'));
      es.push({ id: `e-${prev}-done`, source: prev, target: 'done' });
    }

    return { nodes: ns, edges: es };
  }, [config, running, alive]);

  return (
    <div className="sg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} size={1} color="#ebedf0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
