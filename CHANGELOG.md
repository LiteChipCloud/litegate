# Changelog

本项目的全部重要变更记录于此文件。版本号遵循语义化版本（SemVer）。

## [0.10.0]（待发布）

### 新增

- **支持矩阵 6 → 14 款工具**：新增 CodeBuddy、WorkBuddy（V0.2 占位转正实装）、
  Crush（模型经网关自动发现）、OpenCode、Zed（key 走 `LITEGATE_API_KEY`
  环境变量）、Qwen Code（settings.json env 段）、Goose（模型清单文件 +
  env key）——全部基于官方文档/开源源码查证，零猜测 schema
- **三平台 CI**：ubuntu / macos / windows-latest 真机矩阵，每个 push 跑全量
  单测 + E2E 真实进程冒烟（`.github/workflows/test.yml`）
- **E2E 冒烟层**：`npm run test:e2e`——发布字节以真实 CLI 进程 + 临时 HOME
  跑通端到端（含 codex 重复 init 幂等锁）
- **Windows 路径适配**：Zed/Crush/OpenCode/Claude Desktop 四适配器平台分支，
  路径全部官方查证（含 `configPathFor(platform)` 纯函数导出）
- **写入全量原子化**：write-file-atomic 替换全部 14 处配置写点——进程中途被杀
  不再可能留下半截配置文件
- **JSONC 宽容读取**：Zed/OpenCode 对带注释/尾逗号的用户配置 verify 不再误报
  （写入仍保守拒绝，绝不抹掉用户注释）
- **OpenCode 补 `$schema`**、**Qwen Code 幂等跳过**（字节级一致不刷备份）
- Claude Desktop 适配器（0.8.0 系列）：第三方推理 Gateway 模式，全新安装路径
  修复后可正常接入

### 修复

- 🔴 **codex TOML 反斜杠**：Windows 路径写入 `model_catalog_json` 触发 TOML
  非法转义——真 Windows 用户 init codex 必炸（三平台 CI 首跑抓出）
- **claude-desktop 全新安装崩溃**：profile 文件不存在时 `backupFile` ENOENT
- **demo.gif 泄漏本机真实路径**（公开 README）——重录全程沙箱 HOME
- 备份文件名同毫秒碰撞（追加随机后缀）；模型数残留 13→10 同步
- `cmdExists` 硬编码 `/bin/zsh`——Windows 命令检测全数失效 → 按 platform 分支
- 测试基建跨平台化（临时 HOME 不再硬编码 `/tmp`、守卫断言跨平台）

### 变更

- **发布流程改为手动触发**（release-please 自动链拆除）：手改版本 → 推 tag →
  GitHub Actions 手动 Run；发布走 OIDC Trusted Publishing（零 npm token）
- 接入即隐私加固：`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
  （代码与对话只发 LiteGate，已显式设值的用户配置不覆盖）
- `litegate init` 写入 Claude Code `modelPicker`——`/model` 菜单直接列出网关
  在售模型（需 Claude Code 2.1+）

## [0.9.x] - 2026-10

- 0.9.3：重录 demo.gif（models 段同步 Claude 下线后的 10 款模型）
- 0.9.2：Claude Code `/model` 菜单实拍截图、modelPicker 写入
- 0.9.1：接入即隐私加固（`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`）
- 0.9.0：Claude 全系从网关下线的同步（默认模型偏好序清理、README 定价更新）

## [0.8.0] - 2026-10

- Claude Desktop 适配器（第三方推理 Gateway 模式，configLibrary profile 写入）

## [0.7.x] - 2026-10

- 0.7.2：Windows 兼容加固（`process.env.HOME` 全量替换 `os.homedir()` 19 处）
- 0.7.1：Trae/WorkBuddy 真实检测 + 配置存储调研文档；MiniMax verify 兼容
- 0.7.0：codex provider key 内联 + 模型目录（修 GUI 回落 OpenAI）；models
  实时价格排序 + CJK 对齐；按次价格单位修复；README 演示 GIF

## [0.6.0] - 2026-10

- doctor Key 烟测；switch 支持交互式选模型；Continue 适配器；Cursor 检测
  （需 Pro 提示）；codex `wire_api` 改 responses（Codex CLI 已弃用 chat 协议）

## [0.5.0] - 2026-10

- status 显示 LiteGate 接入状态；switch 命令（Claude Code/Codex/ZCode 一键
  切默认模型）；zcode 孤儿 ctx 规则清理；接入检测域名归一化

## [0.4.0] - 2026-10

- doctor 诊断命令；rollback 一键回滚；MiniMax Code 适配器

## [0.2.0] - 2026-10

- 首批公开：init / status / models 三命令，Claude Code / Codex / ZCode
  三款适配器，自动备份与回滚
