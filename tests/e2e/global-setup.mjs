// E2E 的数据前置：每次跑测试都重建一个隔离的 home。
//
// 这里不是「清缓存」：NX_NX_HOME 决定了服务组配置、运行态、日志落在哪。
// 不复用上一次的 home——上一次创建的 ping-demo 会让「从模板创建」点出冲突，
// 测试就变成依赖执行顺序的薛定谔用例。
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup() {
  const root = process.cwd();
  const home = join(root, '.e2e-home');
  rmSync(home, { recursive: true, force: true });
  mkdirSync(join(home, 'scripts'), { recursive: true });
  // 模板生成的脚本会 import ./aliases.mjs；脚本目录必须是 assets/scripts 的副本。
  cpSync(join(root, 'assets', 'scripts'), join(home, 'scripts'), { recursive: true });
  console.log('[e2e] 隔离数据目录已重建:', home);
}
