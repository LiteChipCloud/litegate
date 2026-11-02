# 发版指南（release-please + npm Trusted Publishing）

> 本仓库 `@litechipcloud/litegate` 的自动化发版链路。
> CI 骨架由两个 workflow 组成，**本仓库零 classic token 依赖**——npm 发布走
> OIDC Trusted Publishing，不需要在任何地方保存 npm token。

## 一、链路总览

```
conventional commits 推到 main
        │
        ▼
.github/workflows/release-please.yml（googleapis/release-please-action@v4）
        │  自动开/更新 Release PR："chore(main): release X.Y.Z"
        │  （bump package.json + package-lock.json + CHANGELOG.md）
        ▼
邓总审核并合并 Release PR
        │
        ▼
release-please 创建 GitHub Release + tag vX.Y.Z，写回 .release-please-manifest.json
        │
        ▼  （release: published 事件触发）
.github/workflows/npm-publish.yml
        │  checkout tag → Node 22 → npm ci → npm run build
        │  → npm publish --provenance（prepublishOnly 钩子再次 build + test）
        ▼
npmjs.com 上线，带构建 provenance 徽标
```

## 二、日常发版流程

1. **正常提交**：commit message 走 conventional commits
   （`feat: …` / `fix: …` / `chore(deps): …`）。版本号由 release-please 依据
   commit 类型自动推导（feat → minor，fix/perf → patch，带 `!` 或
   `BREAKING CHANGE:` → major）。
2. **等 Release PR**：push main 后，release-please 自动开/更新
   `chore(main): release X.Y.Z` PR，内含版本号、`CHANGELOG.md` 与
   `package.json`/`package-lock.json` 的 bump。
3. **合并 Release PR**（需要决策权的审合人确认，勿 self-merge）。
4. **自动完成**：GitHub Release + tag `vX.Y.Z` 创建 → `npm-publish.yml` 自动
   跑构建、测试、发布。
5. **验证**：到 <https://www.npmjs.com/package/@litechipcloud/litegate> 确认新
   版本已发布且带 provenance 标识；Release 页有自动生成的 changelog。

> 测试说明：当前没有独立的 test job（第二批再加），测试在 publish 的
> `prepublishOnly` 钩子（`npm run build && npm run test`）里执行——发布即测试，
> 测试不过发布自动中止。

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

### 3.2 GitHub 仓库：配置 RELEASE_PLEASE_TOKEN（打通全自动链条）

- **为什么需要**：GitHub 平台限制——用默认 `GITHUB_TOKEN` 创建的
  Release/PR/tag **不会触发其他 workflow**（release-please-action 官方 README
  明确说明）。不配 PAT，Release PR 与 GitHub Release 照常创建，但
  `npm-publish.yml` 不会被自动触发。
- **怎么做**：建一个 PAT（classic 或 fine-grained 均可；fine-grained 需授予
  本仓库 Contents: Read/Write + Workflows: Read/Write），存为仓库 secret
  **`RELEASE_PLEASE_TOKEN`**。`release-please.yml` 已写成
  `secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN` 的回退形式——
  不配也不报错，只是自动化链条断一环。

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
| 合了 Release PR，GitHub Release 创建了，但 npm-publish 没跑 | `RELEASE_PLEASE_TOKEN` 未配置（GITHUB_TOKEN 限制） | 配 secret（§3.2）；或 Actions 页手动跑 `npm publish` workflow，输入 tag（如 `v0.9.5`）补救 |
| npm publish 报 403 / 404 | Trusted Publisher 配置不匹配（workflow 文件名、仓库、environment 不一致）；或 CI 里 npm < 11.5.1 | 核对 §3.1；workflow 已强制 `npm install -g npm@latest`（Node 22 自带 npm 10.x 不支持 OIDC，最低要求 11.5.1） |
| 包发布了但没有 provenance 徽标 | workflow 缺 `permissions: id-token: write`，或发布未带 `--provenance` | 已内置于 `npm-publish.yml`，勿删 |
| Release PR 长期不开 | main 上没有符合 conventional commits 的提交；或 manifest 版本与 package.json 不同步 | 检查 commit message；核对 `.release-please-manifest.json` 与 `package.json` 的 version 是否一致（两者都应为当前最新版） |

## 六、待人工核对清单

- [ ] release-please-action v4 的 inputs（`token` / `config-file` /
      `manifest-file`）按官方 README v4 写法配置，升级到 v5 时需重核。
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
