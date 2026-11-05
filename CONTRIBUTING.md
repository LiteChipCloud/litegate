# 贡献指南

感谢关注 LiteGate Cli！本项目接受 issue 与 PR。

## 提交 issue

- **Bug**：请附 `litegate doctor` 的输出、操作系统（macOS/Linux/Windows）、
  涉及工具的版本号；
- **新工具适配请求**：请说明该工具是否支持自定义 OpenAI/Anthropic 兼容端点，
  如有官方配置文档链接更佳；
- **安全漏洞**：请勿公开 issue，通过用户群联系维护者。

## 开发

```bash
npm ci          # 安装依赖
npm test        # 全量测试（含 E2E；E2E 在线层依赖网关可达，不可达自动跳过）
npm run build   # 构建 dist/
```

## 纪律（适配器 PR 必读）

本项目改写的是**用户家目录下的配置文件**，安全承诺由回归测试锁死，新增/修改
适配器必须遵守：

1. **零猜测 schema**：配置格式必须有官方文档或开源源码级证据（注释里给出来源）；
2. **increment 不破坏**：用户已有指向其他服务的配置时明确 skip，不覆盖；
3. **写前必备份**：走 `backupFile`；写入走原子写（`writeFileSyncAtomic`）；
4. **dry-run 不落盘**：`--dry-run` 时 `wrote:false` 且零文件变更；
5. **坏文件拒绝**：目标文件非法 JSON/TOML/YAML 时拒绝修改，绝不静默重建；
6. **key 最小落盘**：工具官方禁止 key 入配置文件的（如 Zed），遵守并提示用户；
7. **测试**：新适配器配齐「全新写入 / 已有配置保留 / dry-run / 坏文件拒绝 /
   verify / restore」用例；三平台路径差异走 `configPathFor(platform)` 纯函数。

## 提交规范

Conventional Commits（`feat:` / `fix:` / `test:` / `docs:` / `chore:`），
中文描述即可。PR 前 `npm test` 必须全绿（CI 会在三平台复核）。
