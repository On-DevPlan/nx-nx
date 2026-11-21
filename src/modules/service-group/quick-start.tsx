// 服务页空态：第一次打开面板时看到的「怎么开始」。
//
// 空态不是「暂无数据」，而是引导位：给一条最短路径 + 每个模板的一句话说明，
// 点按钮就按模板创建（与 CLI 的 sg init 同一条后端路径）。
import { Button, Card, Space, Tag } from 'antd';
import { CloudServerOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ServiceTemplateMeta } from '../../core/service/templates.js';

interface Props {
  templates: ServiceTemplateMeta[];
  working: boolean;
  onUseTemplate: (templateId: string) => void;
  onCreateBlank: () => void;
}

export function ServiceQuickStart({ templates, working, onUseTemplate, onCreateBlank }: Props) {
  const first = templates[0];

  return (
    <Card className="sg-quickstart" title="第一次用？三步跑通一个 node 服务">
      <p className="muted" style={{ marginTop: 0 }}>
        服务组 = 一个长驻服务 + 一组围着它跑的请求脚本。先按模板生成一个能跑的例子，
        再把自己的脚本替换进去——不用先理解全部配置。
      </p>
      <pre className="mono sg-quickstart-code">
        {[
          `nx-nx sg init ${first?.exampleId ?? 'ping-demo'}`,
          `nx-nx sg run ${first?.exampleId ?? 'ping-demo'}`,
          `nx-nx sg stop ${first?.exampleId ?? 'ping-demo'}`,
        ].join('\n')}
      </pre>
      <div className="sg-quickstart-list">
        {templates.map((t) => (
          <div key={t.id} className="sg-quickstart-item">
            <div className="sg-quickstart-head">
              <span className="mono">{t.id}</span>
              <span className="muted">{t.title}</span>
              {t.level === 'case' && <Tag color="blue">推荐起步</Tag>}
            </div>
            <div className="muted sg-quickstart-summary">{t.summary}</div>
            <Space size={8} style={{ marginTop: 6 }}>
              <Button
                size="small"
                type={t.level === 'case' ? 'primary' : 'default'}
                icon={<ThunderboltOutlined />}
                loading={working}
                onClick={() => onUseTemplate(t.id)}
              >
                用这个模板创建
              </Button>
              <span className="muted mono">
                nx-nx sg init {t.exampleId}
                {t.id === first?.id ? '' : ` --template ${t.id}`}
              </span>
            </Space>
          </div>
        ))}
      </div>
      <Space size={12} style={{ marginTop: 16 }}>
        <Button icon={<CloudServerOutlined />} onClick={onCreateBlank} disabled={working}>
          创建空白服务组
        </Button>
        <span className="muted">已有脚本？选空白组后到「配置」里挑主脚本即可。</span>
      </Space>
    </Card>
  );
}
