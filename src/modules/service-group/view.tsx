// 服务首页：只保留日常运维需要的三件事——探活、启动、停止。
//
// 配置、流水线、共享空间都搬到「服务设置」页（settings-view.tsx）。
// 这不是功能缩水：把「每天点的」和「配置一次就不动的」分开，第一次上手
// 才不会先面对一张有八个字段的表单。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Input, InputNumber, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CaretRightOutlined,
  FileTextOutlined,
  HeartOutlined,
  PoweroffOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../web/frontend/components/ui.jsx';
import { useStore } from '../../web/frontend/store.jsx';
import { LogsDrawer } from './logs-drawer.js';
import type { PipelineReport } from '../../core/service/pipeline.js';
import type { GroupView, LaunchParam } from './types.js';

const LIST_KEY = ['service-groups'] as const;

function statusBadge(rt: GroupView['runtime']) {
  if (rt.status !== 'running') return <Badge status="default" text="已停止" />;
  if (rt.alive === false) return <Badge status="error" text="运行中 · 活性 FAIL" />;
  if (rt.alive === true) return <Badge status="success" text="运行中 · 活性 OK" />;
  return <Badge status="processing" text="运行中 · 未检测" />;
}

function tailLines(text: string, max = 8): string {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-max).join('\n');
}

function stepLabel(step: string): string {
  if (step === 'space.check') return '空间闸门';
  if (step === 'main.start') return '启动主脚本';
  if (step === 'main.alive') return '等待活性';
  if (step === 'client') return '测试脚本';
  if (step === 'noop') return '未配置';
  return step;
}

export default function ServiceView() {
  const { client, boot, ui, patchUi } = useStore();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(ui.serviceId || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchIntent, setLaunchIntent] = useState<'start' | 'run'>('start');
  const [launchValues, setLaunchValues] = useState<Record<string, string>>({});
  const [launchProfile, setLaunchProfile] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => client['serviceGroup.list']({}),
    refetchInterval: 5000,
    enabled: Boolean(boot),
  });
  const groups: GroupView[] = listQuery.data?.groups ?? [];
  const current = groups.find((g) => g.config.id === selected) ?? null;

  const logsQuery = useQuery({
    queryKey: ['service-group-logs', selected],
    queryFn: () => client['serviceGroup.logs']({ id: selected ?? '' }),
    refetchInterval: selected ? 5000 : false,
    enabled: Boolean(boot && selected),
  });

  useEffect(() => {
    // 服务被删除或换目录后，选中态可能失效：回到「未选择」而不是继续展示旧组。
    if (selected && listQuery.data && !groups.some((g) => g.config.id === selected)) {
      setSelected(null);
      patchUi({ serviceId: '' });
    }
  }, [groups, selected, listQuery.data, patchUi]);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      patchUi({ serviceId: id });
    },
    [patchUi],
  );

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: LIST_KEY });
    await qc.invalidateQueries({ queryKey: ['service-group-logs', selected] });
  }, [qc, selected]);

  const launchParams: LaunchParam[] = current?.config.launch?.params ?? [];
  const launchProfiles = current?.config.launch?.profiles ?? [];

  const openLaunch = (intent: 'start' | 'run' = 'start') => {
    if (!current) return;
    const values: Record<string, string> = {};
    for (const p of launchParams) {
      values[p.key] = current.runtime.launch?.[p.key] ?? p.default ?? (p.type === 'select' ? (p.options?.[0] ?? '') : '');
    }
    setLaunchIntent(intent);
    setLaunchValues(values);
    setLaunchProfile(undefined);
    setLaunchOpen(true);
  };

  const applyProfile = (name: string | undefined) => {
    setLaunchProfile(name);
    const p = launchProfiles.find((x) => x.name === name);
    if (!p) return;
    const values: Record<string, string> = {};
    for (const param of launchParams) values[param.key] = p.values[param.key] ?? param.default ?? '';
    setLaunchValues(values);
  };

  const act = async (
    action: 'serviceGroup.start' | 'serviceGroup.stop' | 'serviceGroup.check' | 'serviceGroup.run',
    id: string,
    values?: Record<string, string>,
  ) => {
    setBusy(action + id);
    try {
      const payload = { id, ...(values ? { values: JSON.stringify(values) } : {}) };
      const r = await client[action](payload);
      if (action === 'serviceGroup.run') {
        const rep = r as unknown as PipelineReport;
        setReport(rep);
        setReportOpen(true);
        const passed = rep.steps.filter((s) => s.ok).length;
        toast(
          rep.ok
            ? `测试组完成：${passed}/${rep.steps.length} 步通过`
            : `测试组有失败：${passed}/${rep.steps.length} 步通过`,
        );
      } else {
        const data = r as { alive?: boolean; started?: boolean; stopped?: boolean; detail?: string };
        if (action === 'serviceGroup.check') {
          toast(data.alive ? '探活通过' : '探活失败：' + String(data.detail ?? ''));
        } else if (action === 'serviceGroup.start') {
          toast(data.detail?.trim() || (data.started ? '已启动' : '未启动'));
        } else {
          toast(data.stopped ? '已停止' : '未完全停止：' + String(data.detail ?? ''));
        }
      }
      await refresh();
    } catch (e: unknown) {
      toast('失败: ' + String((e as { message?: string })?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const startWithLaunch = () => {
    if (!current) return;
    const id = current.config.id;
    setLaunchOpen(false);
    void act(launchIntent === 'run' ? 'serviceGroup.run' : 'serviceGroup.start', id, launchValues);
  };

  const runWorkflow = () => {
    if (!current) return;
    if (launchParams.length) openLaunch('run');
    else void act('serviceGroup.run', current.config.id);
  };

  const working = busy !== null;
  const running = current?.runtime.status === 'running';
  const hasHealth = Boolean(current?.config.health);
  const events = tailLines(logsQuery.data?.events ?? '');
  // 首页优先展示主脚本的真实输出；还没有输出（刚创建/没启动过）才退回事件日志。
  const output = tailLines(logsQuery.data?.main ?? '');
  const preview = output || events;
  // 上次启动真正用的参数：告诉用户此刻这个服务是「哪个版本」。
  const usedLaunch = launchParams
    .filter((p) => current?.runtime.launch?.[p.key])
    .map((p) => `${p.label}=${current?.runtime.launch?.[p.key]}`)
    .join(' · ');
  const workflowCount = current?.config.clients.length ?? 0;

  return (
    <div className="sg-grid">
      {/* 左栏只做导航：服务组 id + 状态点 + 显示名。 */}
      <Card
        className="sg-list"
        size="small"
        title="服务组"
        extra={<Badge count={groups.length} showZero color="#8b9096" />}
        styles={{ body: { padding: 0, overflow: 'auto', flex: 1, minHeight: 0 } }}
      >
        {groups.map((g) => (
          <button
            key={g.config.id}
            className={'tpl-item' + (g.config.id === selected ? ' active' : '')}
            onClick={() => select(g.config.id)}
          >
            <div className="tpl-name mono">
              {g.runtime.status === 'running' ? (
                <span className={g.runtime.alive === false ? 'dot dot-bad' : 'dot dot-ok'} />
              ) : (
                <span className="dot" />
              )}{' '}
              {g.config.id}
            </div>
            <div className="tpl-desc muted">{g.config.name}</div>
          </button>
        ))}
        {!groups.length && (
          <div className="sg-list-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务组" style={{ margin: '16px 0 8px' }} />
            <Button type="primary" block onClick={() => patchUi({ view: 'service-settings' })}>
              去设置页创建（模板一键生成）
            </Button>
          </div>
        )}
        {listQuery.error && (
          <Alert
            type="error"
            showIcon
            message={String((listQuery.error as { message?: string })?.message || listQuery.error)}
            style={{ margin: 12 }}
          />
        )}
      </Card>

      {/* 右栏是「一个服务」：说明 + 三个动作 + 日志。没有表单、没有画布。 */}
      <div className="sg-detail">
        {!current ? (
          <Card size="small" title="选择一个服务组">
            <Typography.Paragraph type="secondary">
              左侧选一个服务；没有服务就去<Button type="link" style={{ padding: '0 4px' }} onClick={() => patchUi({ view: 'service-settings' })}>设置页</Button>
              用模板创建——会同时生成主脚本、client 和共享面板。
            </Typography.Paragraph>
          </Card>
        ) : (
          <Card
            size="small"
            title={
              <Space size={8} style={{ minWidth: 0 }}>
                <Typography.Text code>{current.config.id}</Typography.Text>
                {statusBadge(current.runtime)}
              </Space>
            }
            extra={
              <Space size={6}>
                <span className="muted">{current.config.name}</span>
                <Tooltip title="服务设置：主脚本、活性、流水线、共享面板">
                  <Button
                    size="small"
                    type="text"
                    icon={<SettingOutlined />}
                    aria-label="服务设置"
                    onClick={() => patchUi({ view: 'service-settings' })}
                  />
                </Tooltip>
              </Space>
            }
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {current.config.desc || '还没写说明——去设置页补一句这个服务是干什么的。'}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" className="mono sg-cwd" style={{ marginBottom: 12 }}>
              cwd: {current.config.cwd || '（启动时自动创建默认目录）'}
            </Typography.Paragraph>
            {usedLaunch && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
                启动参数：{usedLaunch}
              </Typography.Paragraph>
            )}

            <Space size={8} wrap>
              <Tooltip title={hasHealth ? '立即执行一次端口 / HTTP 探活' : '先在设置页配置活性检测'}>
                <Button
                  size="small"
                  icon={<HeartOutlined />}
                  disabled={working || !hasHealth}
                  onClick={() => void act('serviceGroup.check', current.config.id)}
                >
                  探活
                </Button>
              </Tooltip>
              <Tooltip title="启动主脚本（detached，IO 重定向到日志）">
                <Button
                  size="small"
                  type="primary"
                  icon={<CaretRightOutlined />}
                  disabled={working || running}
                  onClick={() =>
                    launchParams.length ? openLaunch() : void act('serviceGroup.start', current.config.id)
                  }
                >
                  启动
                </Button>
              </Tooltip>
              <Tooltip
                title={
                  workflowCount
                    ? `一键运行测试组：启动/复用服务 → 等活性 → ${workflowCount} 个脚本依次执行`
                    : '先在设置页的「流水线」选测试脚本'
                }
              >
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  disabled={working || workflowCount === 0}
                  loading={busy === `serviceGroup.run${current.config.id}`}
                  onClick={runWorkflow}
                >
                  运行测试组{workflowCount ? ` (${workflowCount})` : ''}
                </Button>
              </Tooltip>
              <Tooltip title={running ? '按 stopMode 关闭服务' : '服务当前未运行'}>
                <Button
                  size="small"
                  danger
                  icon={<PoweroffOutlined />}
                  disabled={working || !running}
                  onClick={() => void act('serviceGroup.stop', current.config.id)}
                >
                  停止
                </Button>
              </Tooltip>
            </Space>

            {current.runtime.detail && (
              <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0', fontSize: 12 }}>
                {current.runtime.detail}
              </Typography.Paragraph>
            )}

            <div className="sg-log-head">
              <span className="muted">最近日志{output ? '（服务输出）' : '（事件）'}</span>
              <Button
                size="small"
                type="link"
                icon={<FileTextOutlined />}
                onClick={() => setLogsOpen(true)}
              >
                查看完整日志
              </Button>
            </div>
            <pre className="mono sg-log-pre">{preview || '（还没有日志）'}</pre>
          </Card>
        )}
      </div>

      <Modal
        open={launchOpen}
        title={
          current
            ? `${launchIntent === 'run' ? '运行测试组' : '启动'} · ${current.config.name}`
            : launchIntent === 'run'
              ? '运行测试组'
              : '启动服务'
        }
        okText={launchIntent === 'run' ? '运行' : '启动'}
        cancelText="取消"
        onOk={startWithLaunch}
        onCancel={() => setLaunchOpen(false)}
        destroyOnClose
      >
        {launchProfiles.length > 0 && (
          <div className="sg-launch-row">
            <div className="sg-launch-label">预设</div>
            <Select
              value={launchProfile}
              onChange={applyProfile}
              allowClear
              placeholder="自定义（不套预设）"
              style={{ width: '100%' }}
              options={launchProfiles.map((p) => ({ value: p.name, label: p.name }))}
            />
          </div>
        )}
        {launchParams.map((p) => {
          const value = launchValues[p.key] ?? '';
          return (
            <div className="sg-launch-row" key={p.key}>
              <div className="sg-launch-label">
                {p.label}
                {(p.arg || p.env) && (
                  <span className="muted mono sg-launch-meta">
                    {p.arg ? `--${p.arg}` : ''}
                    {p.arg && p.env ? ' · ' : ''}
                    {p.env ? `$${p.env}` : ''}
                  </span>
                )}
              </div>
              {p.type === 'select' ? (
                <Select
                  value={value || undefined}
                  onChange={(v) => setLaunchValues({ ...launchValues, [p.key]: v ?? '' })}
                  placeholder={p.placeholder || '请选择'}
                  style={{ width: '100%' }}
                  options={(p.options ?? []).map((o) => ({ value: o, label: o }))}
                />
              ) : p.type === 'number' ? (
                <InputNumber
                  value={value ? Number(value) : undefined}
                  onChange={(v) => setLaunchValues({ ...launchValues, [p.key]: v == null ? '' : String(v) })}
                  placeholder={p.placeholder}
                  style={{ width: '100%' }}
                />
              ) : (
                <Input
                  value={value}
                  onChange={(e) => setLaunchValues({ ...launchValues, [p.key]: e.target.value })}
                  placeholder={p.placeholder}
                />
              )}
              {p.description && <div className="muted sg-launch-desc">{p.description}</div>}
            </div>
          );
        })}
        <Alert
          type="info"
          showIcon
          message={
            launchIntent === 'run'
              ? '参数用于本次运行：先启动/复用服务，再按设置页的顺序执行测试脚本。'
              : '参数会写入本次运行态：自愈重启沿用，停止会按这里填的端口关服务。'
          }
        />
      </Modal>

      <Modal
        open={reportOpen}
        title={report ? `测试组结果 · ${report.groupId}` : '测试组结果'}
        width={760}
        onCancel={() => setReportOpen(false)}
        footer={[
          <Button
            key="logs"
            onClick={() => {
              setReportOpen(false);
              setLogsOpen(true);
            }}
          >
            查看执行日志
          </Button>,
          <Button key="close" type="primary" onClick={() => setReportOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        {report && (
          <>
            <Alert
              type={report.ok ? 'success' : 'error'}
              showIcon
              message={
                report.ok
                  ? `全部通过：${report.steps.filter((s) => s.ok).length}/${report.steps.length} 步`
                  : `有失败：${report.steps.filter((s) => s.ok).length}/${report.steps.length} 步通过`
              }
              style={{ marginBottom: 12 }}
            />
            <div className="sg-report">
              {report.steps.map((s, i) => (
                <div className="sg-report-step" key={s.step + i}>
                  <div className="sg-report-head">
                    <Tag color={s.ok ? 'green' : 'red'}>{s.ok ? '通过' : '失败'}</Tag>
                    <span className="sg-report-kind">{stepLabel(s.step)}</span>
                    <span className="mono muted">{s.script}</span>
                  </div>
                  {s.detail && (
                    <pre className="sg-report-detail">
                      {s.step === 'client' ? tailLines(s.detail, 10) : s.detail}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      <LogsDrawer groupId={selected} open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
}
