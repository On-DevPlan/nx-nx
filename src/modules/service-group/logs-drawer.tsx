// 服务组日志抽屉：事件日志 / 主脚本 IO 日志 / HTTP 请求日志清单。
//
// 为什么单独一个抽屉而不是塞进状态卡：日志是**排查时才看**的东西，
// 平时占着地方会挤掉状态信息；抽屉按需拉取、随手关掉，状态卡保持一眼可读。
//
// 组件库：antd Drawer + Tabs（token 见 components/theme.tsx）。
import { useCallback, useEffect, useState } from 'react';
import { Drawer, Empty, Tabs, Typography } from 'antd';
import { useStore } from '../../web/frontend/store.jsx';

const { Text } = Typography;

interface HttpLogEntry {
  file: string;
  name: string;
  size: number;
  mtime: number;
}

interface LogsPayload {
  events: string;
  main: string;
  mainFile: string;
  http: HttpLogEntry[];
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LogsDrawer({
  groupId,
  open,
  onClose,
}: {
  groupId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { client } = useStore();
  const [data, setData] = useState<LogsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      setData(await client['serviceGroup.logs']({ id: groupId }));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [client, groupId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const events = data?.events ?? '';
  const main = data?.main ?? '';
  const http = data?.http ?? [];

  return (
    <Drawer
      title={groupId ? `服务组日志 · ${groupId}` : '服务组日志'}
      open={open}
      onClose={onClose}
      width={860}
      destroyOnHidden
      loading={loading}
    >
      <Tabs
        size="small"
        items={[
          {
            key: 'events',
            label: '事件',
            children: events ? (
              <pre className="sg-log-pre">{events}</pre>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事件（启动 / 停止 / 检测失败 / 自愈都会记在这里）" />
            ),
          },
          {
            key: 'main',
            label: '主脚本',
            children: main ? (
              <>
                <pre className="sg-log-pre">{main}</pre>
                {data?.mainFile && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {data.mainFile}
                  </Text>
                )}
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无主脚本日志（先启动一次服务）" />
            ),
          },
          {
            key: 'http',
            label: `HTTP 请求${http.length ? ` (${http.length})` : ''}`,
            children: http.length ? (
              <div className="sg-http-list">
                {http.map((h) => (
                  <div key={h.file} className="sg-http-row">
                    <span className="mono sg-http-name">{h.name}</span>
                    <span className="muted">{fmtSize(h.size)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无请求日志（client 脚本里的 send() 会一请求一文件）" />
            ),
          },
        ]}
      />
    </Drawer>
  );
}
