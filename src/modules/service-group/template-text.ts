// 服务组模板的文本输出（从 index.ts 拆出：单文件有效行数有上限）。
//
// 两份 render 都在讲「用户下一步照抄什么」：模板清单给创建命令，
// init 结果给脚本清单 + 配置摘要 + 下一步命令。
import type { InitResult, ServiceTemplateMeta } from '../../core/service/templates.js';

export function formatTemplates(templates: ServiceTemplateMeta[]): string {
  const lines = ['服务组模板（每条模板都会生成「能跑、能探活、能关」的脚本 + 配置）:'];
  for (const t of templates) {
    const level = t.level === 'case' ? '最小案例' : '业务案例';
    lines.push('');
    lines.push(`  ${t.id}  ${t.title}  [${level}]  默认端口 ${t.defaultPort}`);
    lines.push(`     ${t.summary}`);
    lines.push(`     创建: nx-nx sg init ${t.exampleId}${t.id === 'node-ping' ? '' : ` --template ${t.id}`}`);
  }
  lines.push('');
  lines.push('自定义 id / 端口 / 显示名:');
  lines.push('  nx-nx sg init my-svc --template node-ping --port 18080 --name "我的服务"');
  lines.push('  先看会生成什么（不落盘）: nx-nx sg init my-svc --dry');
  return lines.join('\n');
}

export function formatInit(r: InitResult): string {
  const lines: string[] = [];
  lines.push(
    r.dryRun
      ? `（dry-run，未落盘）模板 ${r.template.id} → 服务组 ${r.groupId}`
      : `✔ 已按模板 ${r.template.id} 创建服务组 ${r.groupId}（${r.name}）`,
  );
  lines.push('', '脚本:');
  for (const f of r.files) {
    const mark = r.dryRun ? (f.exists ? (f.same ? '=' : '!') : '+') : r.written.includes(f.name) ? '+' : '=';
    lines.push(`  ${mark} ${f.name}.mjs   ${f.desc}`);
  }
  lines.push('', '配置:');
  lines.push(`  main      ${r.config.main?.script ?? '(无)'} ${(r.config.main?.args ?? []).join(' ')}`.trimEnd());
  if (r.config.health) {
    const h = r.config.health;
    lines.push(
      `  health    ${h.kind} ${h.host}:${h.port}${h.path} · 每 ${h.intervalMs}ms · 阈值 ${h.failThreshold} · 自愈${h.onDead === 'restart' ? '开' : '关'}`,
    );
  }
  lines.push(
    r.config.stop
      ? `  stop      ${r.config.stop.script} · mode=${r.config.stopMode}`
      : `  stop      mode=${r.config.stopMode}${r.config.killPort ? ` · 兜底端口 ${r.config.killPort}` : ''}`,
  );
  if (r.config.launch?.entries.length) {
    lines.push(
      `  launch    ${r.config.launch.entries
        .map((e) => `${e.name}${e.port ? `(:${e.port})` : ''}`)
        .join(' · ')}（第一条默认；启动时选版本）`,
    );
  }
  if (r.config.shared) {
    lines.push(`  shared    ${r.config.shared}${r.config.space ? ` · check=${r.config.space.check}` : ''}`);
  }
  lines.push(`  clients   ${r.config.clients.join(' → ') || '（无）'}`);
  if (r.conflicts.length) {
    lines.push('', `! 已存在且内容不同: ${r.conflicts.join(', ')}（加 --force 覆盖）`);
  }
  lines.push('', r.dryRun ? '去掉 --dry 再执行即可落盘。' : '下一步（照抄即可）:');
  for (const s of r.template.steps) lines.push(`  ${s.replaceAll('{id}', r.groupId)}`);
  return lines.join('\n');
}
