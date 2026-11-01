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
