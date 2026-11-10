// spike：CLI 树 —— 从 action 声明派生出**层级命令树**与 help 文本。
//
// 这是「CLI 完全自动化」的载体：树的每一个节点都是声明的产物，
// 没有任何一处手写命令名、手写 switch、手写 help。
//
// 树节点可以同时有子节点与自己的 action（如 'skill' 本身是个命令，
// 'skill install' 是它的子命令）——这在既有模型里靠「最长匹配」解决，
// 在树模型里是天然结构。
import type { ActionDef } from './registry.js';
import { describeInput } from './schema.js';

export interface TreeNode {
  /** 路径段（根节点为 ''） */
  name: string;
  path: string[];
  children: TreeNode[];
  /** 挂在这个节点上的 action（可与 children 并存） */
  action?: ActionDef;
  /** 别名路径：节点存在是为了能派发，但 help 里不单独列一条 */
  aliasOf?: ActionDef;
}

export function buildTree(actions: ActionDef[]): TreeNode {
  const root: TreeNode = { name: '', path: [], children: [] };
  for (const action of actions) {
    for (const path of [action.cli, ...(action.aliases ?? [])]) {
      let node = root;
      path.forEach((seg, i) => {
        let next = node.children.find((c) => c.name === seg);
        if (!next) {
          next = { name: seg, path: path.slice(0, i + 1), children: [] };
          node.children.push(next);
        }
        node = next;
      });
      // 主路径挂 action；别名路径挂在 aliasOf 上——既能派发，又不会在 help 里
      // 变成两条一样的命令（help 只认 action）。
      if (path === action.cli) node.action = action;
      else node.aliasOf = action;
    }
  }
  return root;
}

/** 节点上的 action（主路径或别名） */
export function actionOf(node: TreeNode): ActionDef | undefined {
  return node.action ?? node.aliasOf;
}

/** 找树里与 argv 前缀匹配的最长命令节点 */
export function matchTree(root: TreeNode, argv: string[]): { node: TreeNode; rest: string[] } | null {
  let best: { node: TreeNode; rest: string[] } | null = null;
  const walk = (node: TreeNode, depth: number): void => {
    if (actionOf(node) && depth > (best ? best.node.path.length : 0)) {
      best = { node, rest: argv.slice(depth) };
    }
    for (const child of node.children) {
      if (argv[depth] === child.name) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return best;
}

/** action 的用法串（树里的叶子 → 命令 + 位置参数 + flag） */
export function usageOf(action: ActionDef): string {
  const parts: string[] = [...action.cli];
  for (const f of describeInput(action)) {
    if (!f.positional) continue;
    parts.push(f.required ? `<${f.name}>` : `[${f.name}]`);
  }
  for (const f of describeInput(action)) {
    if (f.positional) continue;
    const token = f.kind === 'boolean' ? `--${f.name}` : `--${f.name} <${f.enumValues?.join('|') ?? f.name}>`;
    parts.push(f.required ? token : `[${token}]`);
  }
  return parts.join(' ');
}

/** help 文本：按树层级缩进打印 */
export function renderHelp(root: TreeNode, appName: string): string {
  const lines: string[] = [`${appName} —— 命令树（全部由 action 声明派生）`, ''];
  const walk = (node: TreeNode, indent: number): void => {
    for (const child of node.children) {
      // 别名叶子（只有 aliasOf、没有 action）不进 help
      if (!child.action && child.aliasOf && !child.children.length) continue;
      const prefix = '  '.repeat(indent);
      if (child.action) {
        lines.push(`${prefix}${child.path.join(' ')}${child.action.summary ? '  —— ' + child.action.summary : ''}`);
      } else {
        lines.push(`${prefix}${child.path.join(' ')}/`);
      }
      walk(child, indent + 1);
    }
  };
  walk(root, 0);
  return lines.join('\n');
}
