# Changelog

本文件记录对外可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

- 新条目写在文件最上面；尚未发版的收进 [Unreleased]，发版时改成 `版本号 - 日期`（YYYY-MM-DD）
- 条目按 Added / Changed / Deprecated / Removed / Fixed / Security 分组，没有的组不写
- 只记对外可见的变更：HTTP API 契约、配置、数据库结构、依赖与安全；内部重构不记

## [Unreleased]

### Added

- 初始骨架：GoFrame v2 + PostgreSQL + React + nginx 的 mono-repo 全栈骨架（由 nx-nx 的 `mono-gf` 模板生成）。
