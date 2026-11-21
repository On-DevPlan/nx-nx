// 服务组模板：把「一组脚本 + 一份组配置」一次物化出来。
//
// 为什么要有模板：
//   服务组的完整配置有 8 个字段（main / stop / killPort / stopMode / health /
//   shared / space / clients）。第一次上手的人面对一张空表单和一段 JSON，
//   只能靠猜——这正是「难以上手」的根因。模板就是「已经写好、能跑、能探活、
//   能关」的默认答案：一条 `sg init` 全生成，改脚本即可接自己的业务。
//
// 文件布局：
//   assets/service-templates/<模板 id>/*.tpl   —— .mjs 正文 + {{ID}} / {{PORT}} 占位
//   assets/scripts/<脚本名>.mjs                —— 落盘后的运行目录（唯一真相源）
//
// 模板只负责「生成」，不负责运行：启停/探活/自愈仍走 core/service/runtime.ts。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badInput, conflict, specError } from '../errors/index.js';
import { scriptsDir } from '../script/paths.js';
import { upsertScriptManifest } from '../script/manifest.js';
import { assertGroupId } from './paths.js';
import { loadGroups, normalizeGroup, saveGroups, type ServiceGroupConfig } from './store.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- 模板声明（内容在 assets/service-templates 下，声明在这里）----

export type TemplateRole = 'main' | 'client' | 'shared' | 'stop';

interface TemplateFileSpec {
  /** .tpl 文件名（同目录下） */
  tpl: string;
  role: TemplateRole;
  desc: string;
  /** 登记进 manifest.json 的用法；{id} 会被替换成组 id */
  usage?: string;
}

export interface ServiceTemplateMeta {
  id: string;
  title: string;
  summary: string;
  /** case = 最小可跑案例；business = 带业务接口的示例 */
  level: 'case' | 'business';
  tags: string[];
  defaultPort: number;
  defaultName: string;
  /** 面板「用模板创建」预填的组 id */
  exampleId: string;
  healthPath: string;
  /** 下一步命令（含 {id} 占位） */
  steps: string[];
}

interface TemplateDef extends ServiceTemplateMeta {
  files: readonly TemplateFileSpec[];
}

const TEMPLATES: readonly TemplateDef[] = [
  {
    id: 'node-ping',
    title: 'Node HTTP 服务 + /ping',
    summary: '零依赖的 Node HTTP 服务：GET /ping → pong。带上活性检测、自愈与共享面板闸门——第一次上手就用这个，一条命令生成、能跑、能关。',
    level: 'case',
    tags: ['node', '最小案例', 'http'],
    defaultPort: 18080,
    defaultName: 'Ping 服务',
    exampleId: 'ping-demo',
    healthPath: '/ping',
    files: [
      {
        tpl: 'server.mjs.tpl',
        role: 'main',
        desc: '长驻 HTTP 服务：GET /ping → pong、GET /health → JSON',
        usage: 'nx-nx sg start {id}',
      },
      {
        tpl: 'client.mjs.tpl',
        role: 'client',
        desc: 'client：请求 /ping 并断言 pong（基础设施来自共享面板）',
        usage: 'nx-nx sg run {id}',
      },
      {
        tpl: 'shared.mjs.tpl',
        role: 'shared',
        desc: '共享面板：BASE_URL + checkUp 起飞闸门',
        usage: '（共享面板，组内脚本执行前自动装载，不能直接运行）',
      },
    ],
    steps: [
      'nx-nx sg run {id}      # 启动 → 等就绪 → client 打 /ping',
      'nx-nx sg start {id}    # 只启动主脚本',
      'nx-nx sg check {id}    # 立即探活：GET /ping',
      'nx-nx sg stop {id}     # 关闭（杀端口占用进程）',
      'nx-nx sg show {id}     # 查看配置与运行态',
    ],
  },
  {
    id: 'node-api',
    title: 'Node 业务 API 服务（Bearer 鉴权）',
    summary: '带业务接口的 Node 服务：GET/POST /api/customers + Bearer token。共享面板里放 token 与 API 封装，client 只写业务流程；另附优雅关停脚本。',
    level: 'business',
    tags: ['node', 'api', 'bearer', '共享面板'],
    defaultPort: 18081,
    defaultName: '业务 API 服务',
    exampleId: 'api-demo',
    healthPath: '/health',
    files: [
      {
        tpl: 'server.mjs.tpl',
        role: 'main',
        desc: '长驻 HTTP 服务：/health + /api/customers（Bearer 鉴权），pid 落盘',
        usage: 'nx-nx sg start {id}',
      },
      {
        tpl: 'stop.mjs.tpl',
        role: 'stop',
        desc: '优雅关停：读 pid 文件结束主脚本',
        usage: 'nx-nx sg stop {id}',
      },
      {
        tpl: 'shared.mjs.tpl',
        role: 'shared',
        desc: '共享面板：API_TOKEN / sendHeaders / api.getCustomers / checkUp',
        usage: '（共享面板，组内脚本执行前自动装载，不能直接运行）',
      },
      {
        tpl: 'client.mjs.tpl',
        role: 'client',
        desc: 'client：带 token 调 getCustomers / createCustomer',
        usage: 'nx-nx sg run {id}',
      },
    ],
    steps: [
      'nx-nx sg run {id}      # 启动 → 等就绪 → client 跑业务请求',
      'nx-nx sg check {id}    # 立即探活：GET /health',
      'nx-nx sg logs {id}     # 事件 / 主脚本 IO / 请求日志',
      'nx-nx sg stop {id}     # 关闭（先跑关停脚本，再兜底杀端口）',
      'nx-nx sg show {id}     # 查看配置与运行态',
    ],
  },
];

// ---- 查询 ----

export function listTemplates(): ServiceTemplateMeta[] {
  return TEMPLATES.map((t) => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    level: t.level,
    tags: [...t.tags],
    defaultPort: t.defaultPort,
    defaultName: t.defaultName,
    exampleId: t.exampleId,
    healthPath: t.healthPath,
    steps: [...t.steps],
  }));
}

export function getTemplate(id?: unknown): TemplateDef {
  const key = id === undefined || id === '' ? 'node-ping' : String(id).trim();
  const t = TEMPLATES.find((x) => x.id === key);
  if (!t) {
    throw badInput(`未知服务组模板: ${key}（可用: ${TEMPLATES.map((x) => x.id).join(', ')}）`);
  }
  return t;
}

// ---- 生成计划（dry-run 与真正落盘共用同一条路径）----

export interface TemplateFile {
  name: string;
  role: TemplateRole;
  desc: string;
  /** 登记进 manifest.json 的用法（{id} 已替换成组 id） */
  usage: string;
  path: string;
  content: string;
  exists: boolean;
  /** 已存在且内容与本次生成完全一致 —— 幂等重跑时跳过 */
  same: boolean;
}

export interface TemplatePlan {
  template: ServiceTemplateMeta;
  groupId: string;
  name: string;
  port: number;
  files: TemplateFile[];
  config: ServiceGroupConfig;
  /** 同 id 的服务组已存在 */
  configExists: boolean;
  /** 已存在且内容不同（会被拒绝，除非 --force） */
  conflicts: string[];
}

export interface InitResult extends TemplatePlan {
  dryRun: boolean;
  written: string[];
  skipped: string[];
}

export interface InitInput {
  groupId: unknown;
  templateId?: unknown;
  port?: unknown;
  name?: unknown;
  force?: boolean;
  dryRun?: boolean;
}

// 模板正文定位：源码与构建产物的相对层级都是「上三层 = 仓库根」。
export function templatesRoot(): string {
  const candidates = [
    join(HERE, '..', '..', '..', 'assets', 'service-templates'),
    join(process.cwd(), 'assets', 'service-templates'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw specError('找不到服务组模板目录 assets/service-templates（尝试过: ' + candidates.join(', ') + ')');
}

function fileNameOf(role: TemplateRole, groupId: string): string {
  if (role === 'main') return `${groupId}-server`;
  if (role === 'client') return `${groupId}-client`;
  if (role === 'stop') return `${groupId}-stop`;
  return `${groupId}.shared`;
}

function renderTpl(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (all, key: string) => vars[key] ?? all);
}

function buildConfig(t: TemplateDef, groupId: string, name: string, port: number, files: TemplateFile[]): ServiceGroupConfig {
  const main = files.find((f) => f.role === 'main');
  const stop = files.find((f) => f.role === 'stop');
  const shared = files.find((f) => f.role === 'shared');
  const clients = files.filter((f) => f.role === 'client').map((f) => f.name);
  if (!main) throw specError(`模板 ${t.id} 没有 main 脚本`);
  return normalizeGroup(
    {
      name,
      desc: t.summary.split(/[。\n]/)[0],
      main: { script: main.name, args: ['--port', String(port)] },
      stop: stop ? { script: stop.name, args: [] } : undefined,
      killPort: port,
      stopMode: 'auto',
      health: {
        kind: 'http',
        host: '127.0.0.1',
        port,
        path: t.healthPath,
        intervalMs: 3000,
        failThreshold: 2,
        readyTimeoutMs: 15000,
        onDead: 'restart',
      },
      shared: shared?.name,
      space: shared ? { panel: shared.name, check: 'checkUp' } : undefined,
      clients,
      // 启动版本：端口 / 配置文件 / 环境都做成可填字段；预设只是把常用组合一键填好。
      launch: {
        params: [
          {
            key: 'port',
            label: '端口',
            type: 'number',
            default: String(port),
            arg: 'port',
            placeholder: '18080',
            description: '服务监听端口；探活与 stop 会跟着这个值走。',
          },
          {
            key: 'env',
            label: '运行环境',
            type: 'select',
            options: ['development', 'staging', 'production'],
            default: 'development',
            env: 'NODE_ENV',
          },
          {
            key: 'config',
            label: '配置文件',
            type: 'text',
            default: 'config/default.json',
            arg: 'config',
            placeholder: 'config/default.json',
            description: '作为 --config 传给主脚本；脚本不读也不影响启动。',
          },
        ],
        profiles: [
          { name: '默认', values: { port: String(port), env: 'development', config: 'config/default.json' } },
          { name: '预发', values: { port: String(port + 1), env: 'staging', config: 'config/staging.json' } },
          { name: '生产', values: { port: String(port + 2), env: 'production', config: 'config/prod.json' } },
        ],
      },
    },
    groupId,
  );
}

function toPort(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw badInput(`端口非法: ${String(raw)}（须为 1~65535 的整数）`);
  }
  return n;
}

export function planTemplate(input: InitInput): TemplatePlan {
  const groupId = assertGroupId(input.groupId);
  const t = getTemplate(input.templateId);
  const port = toPort(input.port, t.defaultPort);
  const name = String(input.name ?? '').trim() || t.defaultName;
  const root = join(templatesRoot(), t.id);
  const vars: Record<string, string> = { ID: groupId, PORT: String(port), NAME: name };

  const files: TemplateFile[] = t.files.map((spec) => {
    const tplPath = join(root, spec.tpl);
    if (!existsSync(tplPath)) throw specError(`模板 ${t.id} 缺文件: ${tplPath}`);
    const nameOf = fileNameOf(spec.role, groupId);
    const path = join(scriptsDir(), nameOf + '.mjs');
    const content = renderTpl(readFileSync(tplPath, 'utf8'), vars);
    const exists = existsSync(path);
    return {
      name: nameOf,
      role: spec.role,
      desc: spec.desc,
      usage: (spec.usage ?? '').replaceAll('{id}', groupId),
      path,
      content,
      exists,
      same: exists && readFileSync(path, 'utf8') === content,
    };
  });

  const config = buildConfig(t, groupId, name, port, files);
  return {
    template: listTemplates().find((x) => x.id === t.id)!,
    groupId,
    name,
    port,
    files,
    config,
    configExists: loadGroups().some((g) => g.id === groupId),
    conflicts: files.filter((f) => f.exists && !f.same).map((f) => f.name),
  };
}

// ---- 落盘 ----

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

export function applyTemplate(input: InitInput): InitResult {
  const plan = planTemplate(input);
  const force = Boolean(input.force);

  if (!force && plan.configExists) {
    throw conflict(`服务组 ${plan.groupId} 已存在（用 nx-nx sg show ${plan.groupId} 查看；要按模板重建加 --force）`);
  }
  if (!force && plan.conflicts.length) {
    throw conflict(
      `这些脚本已存在且内容不同: ${plan.conflicts.join(', ')}（换一个组 id，或加 --force 覆盖）`,
    );
  }

  const written: string[] = [];
  const skipped: string[] = [];
  if (!input.dryRun) {
    // 服务自己的 cwd 先建好：主脚本第一次启动前就存在，client 可以立即写产物。
    if (plan.config.cwd) mkdirSync(plan.config.cwd, { recursive: true });
    for (const f of plan.files) {
      if (f.exists && f.same) {
        skipped.push(f.name);
        continue;
      }
      writeAtomic(f.path, f.content);
      upsertScriptManifest({ name: f.name, description: f.desc, usage: f.usage });
      written.push(f.name);
    }
    saveGroups([...loadGroups().filter((g) => g.id !== plan.groupId), plan.config]);
  }

  return { ...plan, dryRun: Boolean(input.dryRun), written, skipped };
}

