# 发版指南（手动发布 + npm Trusted Publishing）

> 本仓库 `@litechipcloud/litegate` 的发版指南。
> **2026-11-05 邓总拍板：不做自动发布，改为手动触发**（release-please 自动链
> 已拆除；Release PR #1 已关闭未合并）。发布走 GitHub Actions 手动触发 +
> OIDC Trusted Publishing，零 classic token 依赖。

## 一、链路总览

```
本地：改 package.json version + CHANGELOG（手动维护）
        │
        ▼
git tag vX.Y.Z && git push origin vX.Y.Z
        │
        ▼
GitHub → Actions → 「npm publish」→ Run workflow → 填 tag
        │  （workflow_dispatch 手动触发，唯一入口）
.github/workflows/npm-publish.yml
        │  checkout tag → Node 22 → 重写 lock registry → npm ci → npm run build
        │  → npm publish --provenance（prepublishOnly 钩子再次 build + test）
        ▼
npmjs.com 上线，带构建 provenance 徽标
```

## 二、日常发版流程

1. **改版本号**：手动改 `package.json` 的 `version`（+ 同步 CHANGELOG，
   如有）并 commit 推 main。
2. **打 tag**：`git tag v0.10.0 && git push origin v0.10.0`（与 package.json
   版本一致）。
3. **手动触发发布**：GitHub 仓库 → Actions → **npm publish** → Run workflow
   → 填入 tag（如 `v0.10.0`）→ 确认。
4. **验证**：到 <https://www.npmjs.com/package/@litechipcloud/litegate> 确认新
   版本已发布且带 provenance 标识。

> 测试门禁：发布前 `prepublishOnly` 钩子（`npm run build && npm run test`）
> 必过——测试不过发布自动中止。另有 `test.yml` 三平台矩阵（ubuntu/macos/
> windows）在每次 push 时独立跑全量单测 + E2E。

## 三、一次性人工配置清单（首次接入必做）

### 3.1 npmjs.com：配置 Trusted Publisher

登录 npmjs.com → 包 `@litechipcloud/litegate` → **Settings → Trusted Publisher**，
填写：

| 字段 | 值 | 备注 |
| --- | --- | --- |
| Registry package | `@litechipcloud/litegate` | |
| Repository owner | `LiteChipCloud` | |
| Repository name | `litegate` | |
| Workflow filename | `npm-publish.yml` | 🔴 必须与 `.github/workflows/npm-publish.yml` 文件名**逐字符一致**，不匹配即 403/404 |
| Environment | 留空 | 本 workflow 未使用 GitHub environment；若在 npm 侧强制要求 environment，需在 `npm-publish.yml` 的 job 上同步加 `environment: <名>`，两边一致 |

配置后，CI 发布用 GitHub OIDC 证明"这个包确实来自这个仓库的这个 workflow"，
无需任何 npm token。

### 3.2 GitHub 仓库：RELEASE_PLEASE_TOKEN（已随自动链拆除，可删可留）

release-please 自动链已拆除，secret `RELEASE_PLEASE_TOKEN` 已无消费者，
留着无害、删除亦可（仓库 Settings → Secrets and variables → Actions）。

### 3.3 不需要做的

- ❌ **不需要** `NPM_TOKEN` / `NODE_AUTH_TOKEN` secret——发布鉴权完全走
  Trusted Publishing OIDC，本仓库无 classic token 依赖。

## 四、classic token 时间线（为什么直接上 Trusted Publishing）

npm 官方对 **classic token** 的退役计划：

| 时间 | 动作 |
| --- | --- |
| 2025-11 | npmjs.com **停止新建** classic token |
| 2027-01 | 全部存量 classic token **全失效** |

> 🔍 具体日期以 npm 官方公告/GitHub changelog 为准（待人工核对；npm 在
> 2025 年多次调整过渡细节）。趋势确定：classic token 是死路，Trusted
> Publishing 是正解，因此本仓库一步到位，不引入任何 classic token。

## 五、故障排查

| 症状 | 原因 | 处置 |
| --- | --- | --- |
| 手动跑 workflow 报 tag 不存在 | 输入的 tag 未推送远程 | 先 `git push origin vX.Y.Z`，再跑 workflow |
| npm publish 报 403 / 404 | Trusted Publisher 配置不匹配（workflow 文件名、仓库、environment 不一致）；或 CI 里 npm < 11.5.1 | 核对 §3.1；workflow 已强制 `npm install -g npm@latest`（Node 22 自带 npm 10.x 不支持 OIDC，最低要求 11.5.1） |
| 包发布了但没有 provenance 徽标 | workflow 缺 `permissions: id-token: write`，或发布未带 `--provenance` | 已内置于 `npm-publish.yml`，勿删 |
| npm ci 拉到内网 Nexus 报 ENOTFOUND/EAI_AGAIN | lock 重写步骤被改动/删除 | 恢复「重写 lockfile 为官方 registry」步骤（git 历史可见） |

## 六、待人工核对清单

- [ ] npm Trusted Publishing 最低 npm 版本 11.5.1（Node 22 需手动升级 npm）。
- [ ] classic token 停发（2025-11）与全失效（2027-01）的准确日期。
- [ ] 若 npm 侧 Trusted Publisher 配置了 environment，须回填
      `npm-publish.yml` 的 job 级 `environment` 字段。

## 七、demo.gif 维护（CI 自动重录）

README 顶部的 `assets/demo.gif` 由 VHS 从 `assets/demo.tape` 录制，
**不再手工维护**：`.github/workflows/demo.yml` 监听 tape 变更，推到 main
后自动重录，产物与仓库现有 gif 有 diff 才由 `github-actions[bot]`
commit 回 main（commit message 带 `[skip ci]`）。

### 7.1 什么时候需要重录

- **自动**：改了 `assets/demo.tape`（含 workflow 文件本身变更）→ push main 即可。
- **手动**：CLI 输出变了但 tape 没改（适配器文案、status 表格调整等）→
  GitHub Actions 页面手动跑 `demo gif` workflow（workflow_dispatch）。

### 7.2 手动本地重录

在仓库根目录执行：

```bash
npm run build && npm install -g .   # 让 PATH 上的 litegate 指向当前源码构建产物
vhs assets/demo.tape                # 原地覆盖 assets/demo.gif
```

> 本机若 `npm install -g` 过本仓库（`npm ls -g @litechipcloud/litegate`
> 显示软链指向本仓库），全局 `litegate` 会自动跟随 `dist/` 构建，
> 只需 `npm run build && vhs assets/demo.tape` 两步。

### 7.3 录制的沙箱机制（重要，改 tape 前必读）

- **tape 自带隔离环境**：开头 Hide 段把 `HOME` 切到 `/tmp/litegate-demo`，
  在里面真实 `litegate init` 种入演示配置，再录制三条可见命令
  （status / models / init dry-run）。gif 里出现的路径全是
  `/tmp/litegate-demo/...` 沙箱路径。
- 🔴 **禁止在真实 HOME 下录制**：旧版 demo.gif 曾把 `/Users/<用户名>` 下的
  工具配置路径、已装应用（含内部工具名）全部录进公开仓库，属隐私泄漏。
  沙箱机制就是为修这个而加的，动 tape 时别把 Hide 段删了。
- 第三条命令选 `--tools claude-code` 而非 codex：已接入状态下对 codex
  重跑 init 会触发 TOML 重复键校验报错（旧 gif 的收尾画面就是那个报错）；
  claude-code 适配器可优雅增量（仅同步 modelPicker）。

### 7.4 排障

| 症状 | 原因 | 处置 |
| --- | --- | --- |
| CI 录出的 gif 中文变豆腐块 | runner 缺 CJK 字体 | workflow 已内置 `apt-get install fonts-noto-cjk`，勿删；升级 vhs 时留意该步骤仍生效 |
| vhs-action 找不到 `litegate` | 构建/全局安装步骤被跳过或失败 | 核对 `npm ci && npm run build && npm install -g .` 三步都在 vhs-action 之前 |
| 模型目录拉取失败导致 gif 画面退化（status 显示未初始化 / init 报网络错误） | runner 到 `www.litechipcloud.cn` 网络抖动 | 重跑 workflow_dispatch 即可；持续失败再查网关服务本身 |
| 自动 commit 没推上去 | main 开了分支保护，`github-actions[bot]` 被拒 | 分支保护规则放行 `github-actions[bot]` 推 main，或把该 job 改成开 PR 模式 |
| gif 出现噪音 diff（内容没变字节却变） | vhs 版本变化改变了编码 | workflow 已钉 `version: v0.12.1`；升级 vhs 时先本地重录对比画面，确认无误再同步改 workflow 里的版本号 |
