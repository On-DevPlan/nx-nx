#!/usr/bin/env python3
# 一键安装/更新 GoFrame 官方 AI skill（github.com/gogf/skills → .claude/skills/goframe-v2）。
#
# 为什么写成脚本而不是让每个人背命令：
#   1. 三条子命令（add/check/update）与一个前置检查（npx 在不在）不值得记；
#   2. Windows 的 npx 是 npx.cmd，Linux/macOS 是 npx——交给 shutil.which 比写在 README 里可靠；
#   3. skills CLI 把 skill 装进「执行时所在目录」的 .claude/skills/，
#      从任意位置调本脚本都必须先回到项目根，否则会装错地方。
#
# 用法：
#   make skills                  # 等价于 add（见 Makefile）
#   python scripts/skills.py     # 首次安装（默认 add）
#   python scripts/skills.py check   # 检查是否有更新
#   python scripts/skills.py update  # 安装更新
#
# 前置：Node.js 18+（npx 随附）。skill 内容 ~6MB，属于「按需下载」而非模板内置——
# 每个生成的项目都自带一份拷贝只会让仓库膨胀且各自过期。
import shutil
import subprocess
import sys
from pathlib import Path

REPO = "github.com/gogf/skills"

# Windows 下往管道写输出默认用本地码页（cp936），中文在 Git Bash / CI（UTF-8）里
# 会变成乱码。统一重设为 UTF-8；直接跑在终端里不受影响。
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8")

# 项目根 = scripts/ 的上一级。resolve() 吃掉符号链接，保证 ROOT 是真实路径。
ROOT = Path(__file__).resolve().parent.parent

USAGE = """用法: python scripts/skills.py [add|check|update]
  add     首次安装 GoFrame 官方 skill（默认）
  check   检查是否有更新
  update  安装更新
"""


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "add"
    if action not in ("add", "check", "update"):
        sys.stderr.write(USAGE)
        return 2

    # Windows 上 which("npx") 依 PATHEXT 找到 npx.cmd，Linux/macOS 直接找到 npx
    npx = shutil.which("npx")
    if npx is None:
        sys.stderr.write("未找到 npx：请先安装 Node.js 18+（https://nodejs.org）\n")
        return 1

    # --yes：npx 本地没有 skills 包时自动下载，不再交互确认一次
    cmd = [npx, "--yes", "skills", action] + ([REPO] if action == "add" else [])
    print(f"[skills] cwd={ROOT}")
    print(f"[skills] run: {' '.join(cmd)}")
    # stdin/stdout/stderr 全透传：skills CLI 可能交互式询问装到哪些 agent 目录
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    sys.exit(main())
