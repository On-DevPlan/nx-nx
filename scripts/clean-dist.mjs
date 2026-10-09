// 构建前清理 dist/。
//
// tsc -b 不会删除「源文件已移除」的旧产物（如 core 目录重组前的平铺文件），
// npm pack 会把它们一并打进包里。每次构建从干净目录开始，杜绝幽灵文件。
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
