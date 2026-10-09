// 文本/二进制路径判定（skill 标准模块自包含，不依赖项目里的生成器）。
import { basename } from 'node:path';

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt',
  '.css', '.html', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.sh',
  '.gitignore', '.npmrc', '.env', '.editorconfig', '',
  // 非 JS 生态。这个判断决定「{{var}} 会被渲染」还是「按二进制原样拷贝」——
  // 漏一个扩展名的后果不是报错，而是**生成的产物里留着字面 {{var}}**（静默坏掉）。
  // mono-gf 模板（GoFrame + nginx + PostgreSQL）就是踩到这一点才补的：
  //   .go .mod .sum  Go 源码与模块文件
  //   .sql          建表脚本
  //   .conf         nginx 等配置文件
  //   .example      .env.example 这类模板文件（扩展名取的是最后一段）
  '.go', '.mod', '.sum', '.sql', '.conf', '.example', '.dockerignore',
]);

export function isTextPath(rel: string): boolean {
  const name = basename(rel);
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot).toLowerCase();
  return TEXT_EXT.has(ext) || /\.(gitignore|npmrc|editorconfig)$/.test(name);
}
