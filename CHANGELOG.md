# Changelog

## [0.10.0](https://github.com/LiteChipCloud/litegate/compare/v0.9.4...v0.10.0) (2026-11-05)


### Features

* **adapters:** Goose 适配器（第 14 款）——纯源码查证实装，零本机安装 ([32f7b54](https://github.com/LiteChipCloud/litegate/commit/32f7b5410df61cd689271c9d18431b443ed75ae2))
* **adapters:** Windows 路径适配——4 适配器平台分支，路径全部官方查证 ([b49ea69](https://github.com/LiteChipCloud/litegate/commit/b49ea69df71b707db78b6a7789086e8a31713509))
* **adapters:** Zed/OpenCode 读取宽容化——jsonc-parser 容忍注释/尾逗号 ([52ed882](https://github.com/LiteChipCloud/litegate/commit/52ed88231f10445e6c69dacdbbf48741381e1684))
* **adapters:** 借鉴 ruler 的两个小改进 + 调研留档 ([ffd4142](https://github.com/LiteChipCloud/litegate/commit/ffd4142ef0bb5d51767e4126e77b8d65c199927f))
* Aider 适配器（.env + .aider.conf.yml）；Cursor 检测（需 Pro 提示）；Gemini CLI 结论（仅 Gemini 协议，暂不适配） ([57f8ebf](https://github.com/LiteChipCloud/litegate/commit/57f8ebf0c9721710b9fee1bfc3a5252a1ca3fc97))
* **ci:** release-please + npm trusted publishing 发版骨架 ([aafb0d8](https://github.com/LiteChipCloud/litegate/commit/aafb0d86b02651b6799da4bda1bf76c1748f7a09))
* **claude-code:** 写入 modelPicker，让 /model 菜单直接列出 LiteGate 在售模型 ([6102441](https://github.com/LiteChipCloud/litegate/commit/61024413f172c8cdee761ef208ffe52c3c85fcf4))
* **claude-code:** 接入即隐私加固——写入 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ([b27674f](https://github.com/LiteChipCloud/litegate/commit/b27674fc43db0f0dd686dcf33fac7ff67f4dc20d))
* Continue 适配器（7 工具）+ switch 写入 Claude Code model 字段 ([0beb10f](https://github.com/LiteChipCloud/litegate/commit/0beb10fcea72916bcc3c78ec84c1e8cc291f4719))
* doctor Key 烟测；switch 支持交互式选模型 ([eef216e](https://github.com/LiteChipCloud/litegate/commit/eef216e98c2695d438a170171d8c299800ff0021))
* doctor 显示 ZCode LiteGate 模型数；init increment 模式遇已有 ANTHROPIC 配置时明确提示不覆盖 ([0526b33](https://github.com/LiteChipCloud/litegate/commit/0526b33c7dbfe6f3de7099fdb4f21ce8a9f373f9))
* LiteGate CLI v0.1.0 —— 一条命令把 AI 编程工具全部接上 LiteGate ([c992d25](https://github.com/LiteChipCloud/litegate/commit/c992d25a560c474298fd6dbff336ef816aaf53d4))
* status 显示 LiteGate 接入状态；verify 接口同步化 ([248a410](https://github.com/LiteChipCloud/litegate/commit/248a410900a3fe3502ae73cd0a5ad3330cc6930e))
* switch 命令——一键切换默认模型（Claude Code/Codex/ZCode） ([71676e3](https://github.com/LiteChipCloud/litegate/commit/71676e31b5320fa38dc19ece8876c3bd99866a99))
* 支持矩阵 6→12——新增 CodeBuddy/Crush/OpenCode/Zed/Qwen Code，WorkBuddy 转正 ([9e2f702](https://github.com/LiteChipCloud/litegate/commit/9e2f702a85d5467a03cb6b5295ccc22b8ebe83d4))


### Bug Fixes

* **backup:** 备份文件名追加随机后缀——消除同毫秒碰撞 ([c0c63e8](https://github.com/LiteChipCloud/litegate/commit/c0c63e8970621ad44ddf18cfa52130c4eea474ac))
* **ci:** config set registry 不影响 lock 已有 resolved——改为直接重写 lockfile host ([fc7026a](https://github.com/LiteChipCloud/litegate/commit/fc7026a0ebb608975c816e9e23ff4d0b8711e019))
* **ci:** runner 解析不了内网 Nexus——CI 安装走官方 registry ([44832f1](https://github.com/LiteChipCloud/litegate/commit/44832f10df25394e3e56a3e9538b099945c8d928))
* **claude-desktop:** 全新安装崩溃——profile 文件不存在时 backupFile ENOENT ([9db2329](https://github.com/LiteChipCloud/litegate/commit/9db23291ea30281f08d86749bf8a2bfd77d732c0))
* **codex:** wire_api 改 responses——Codex CLI 已弃用 chat 协议 ([b2b7df6](https://github.com/LiteChipCloud/litegate/commit/b2b7df6b13f57f1e081a9d880b6f1dc82a23eed6))
* **core:** 配置写入全量原子化——write-file-atomic 替换 14 处 fs.writeFileSync ([cdafa10](https://github.com/LiteChipCloud/litegate/commit/cdafa10db670ffe90433334b0585e5955c6ffc44))
* **demo:** demo.gif 泄漏本机真实路径——重录脱敏 + CI 自动重录 ([4204f42](https://github.com/LiteChipCloud/litegate/commit/4204f42fef0596256e748ccdc69ab898ed0b87a5))
* status verify 调用补全参数 ([308b246](https://github.com/LiteChipCloud/litegate/commit/308b246c41777c11751acdc1b5d0953cf8e37786))
* **windows:** 三平台 CI 首跑抓出四处真问题——全部修复 ([a8564ac](https://github.com/LiteChipCloud/litegate/commit/a8564ac32fb86d7a7b8785ff1efcb69ca3753ac6))
* **windows:** 三平台兼容补齐 + test.yml 三平台 CI——回答「到底测没测 Windows」 ([0d389ca](https://github.com/LiteChipCloud/litegate/commit/0d389caf3c7f6a5a27c600fc610797cf2cb69fee))
* **windows:** 最后两处——goose detect 用例按平台造目录、E2E 弃 npx 直调本地 tsc ([9c7d731](https://github.com/LiteChipCloud/litegate/commit/9c7d7310676ca64989b3a012c8db24a4e1d10003))
* **zcode:** 孤儿 ctx 规则清理的序列化时机修正——清理后再序列化（修复写入旧快照的 bug） ([262d7cd](https://github.com/LiteChipCloud/litegate/commit/262d7cdee5ff1095961b7b3d5bdeb20fc229cbb0))
* 同步 Claude 下线——默认模型偏好序清理 + README 定价/徽章更新 ([1d8863b](https://github.com/LiteChipCloud/litegate/commit/1d8863ba1247470964603143b7ba644f119e7530))
* 接入检测域名归一化（裸域/www 等价）；README 增支持矩阵与 Cursor Pro 提示 ([63ee379](https://github.com/LiteChipCloud/litegate/commit/63ee37999ed87f3eea85ac56205ac162212d3fe1))
* 模型数残留 13→10 同步（package.json/index.ts description）+ 删 types.ts 重复 ChangeRecord ([f3ee9ea](https://github.com/LiteChipCloud/litegate/commit/f3ee9ea9eacaff05b8c2c70efa136e0352ed5eeb))
