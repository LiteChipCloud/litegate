# ruler（intellectronica/ruler）源码调研对我们 CLI 的启示

> 调研方式：`git clone --depth 1` 到 /tmp/ruler-study，只读源码（30+ agent 适配器，TypeScript）。
> 定位差异先说清：ruler 管「指令文件（AGENTS.md 系）+ MCP 服务器传播」，我们管「模型供应商接入」——重叠面在配置文件的读写纪律，不在字段本体。

## 1. 适配器接口与安全机制

**ruler 做法**：IAgent 接口（applyRulerConfig/getDefaultOutputPath + 一组可选能力位）；备份 = `file.bak` + `.ruler-generated` 出处标记 sidecar，**首备份优先**（重复 apply 不覆盖最初备份），已存在的无标记 .bak 直接拒绝使用；写入前拒符号链接/硬链接/越出项目根。**解析失败处理不一致**：Zed/GeminiCli/MistralVibe 抛错拒绝；**Codex 与 Crush 吞掉异常、按空配置重建落盘**（坏文件会被静默清掉用户数据）。
**我们现状**：全适配器统一「拒绝修改」（JSONC 宽容读 + 写入拒绝/输出 assertValid）+ 时间戳备份 + manifest + rollbackAll + dryRun。
**结论**：安全网我们已全面覆盖且比 ruler 一致，不借鉴；值得借的是它的「内容无变化跳过写入」幂等（见改进 2）。

## 2. 重叠配置格式的字段语义

**ruler 做法**：Codex 只写 snake_case `mcp_servers`，且用 @iarna/toml **全量重序列化**——用户 TOML 注释会丢；坏文件静默覆盖。Zed 用 `context_servers`（必须 `source:"custom"`），Crush 用项目级 `.crush.json` 的 `mcp` 键，Qwen Code 写 `contextFileName`——均属 MCP/指令域，不与我们的 provider 写入冲突。OpenCode 则**每次写都确保 `$schema: https://opencode.ai/config.json`**。
**我们现状**：Codex 用「标记块前置 + 输出 assertValidTOML」，坏文件拒绝、注释保留，优于 ruler；Zed/Crush/Qwen 字段经官方文档核实，无写错。唯独 opencode.json 没写 `$schema`，编辑器补全/校验缺失。
**结论**：借鉴 `$schema`（改进 1）；其余维持，我们的 Codex 写法比 ruler 更保守正确。

## 3. 30+ 适配器的公共逻辑组织

**ruler 做法**：AbstractAgent 基类（默认 apply 流程：路径→目录→备份→写）+ 能力位（supportsMcpStdio/Remote/Timeout/NativeSkills）+ 组合复用（CodexCliAgent 内嵌 AgentsMdAgent）+ `filterMcpConfigForAgent` 按能力过滤。
**我们现状**：13 个适配器一文件一实例，公共层已沉到 core/（backup/validate/catalog），差异集中在 switch/coexist 两策略。
**结论**：暂不抽基类。13 个规模下「共享 core + 平铺适配器」更直白；等逼近 30 个或出现第三种策略再评估 AbstractAgent 式收敛。

## 4. 已存在配置的合并策略

**ruler 做法**：按 agent 配 `mcp.strategy: merge|overwrite`（默认 merge，同名服务器**静默覆盖**用户同名项）。
**我们现状**：全局 mode `increment|replace` + 适配器级 `switch/coexist`，increment 对「指向其他服务的既有配置」宁可 skipped 不动。
**结论**：不借鉴。ruler 的 merge 会无声覆盖同名用户配置；我们的 increment 守门对「改的是用户主配置文件」的场景更稳，语义保留现状。

## 落地改进（各 ≤30 行，有测试）

1. **opencode.ts 补 `$schema`**：缺失时前置官方 schema URL，用户已自定义则保留；编辑器获得补全/校验。
2. **qwen-code.ts 字节级一致跳过写入**：out === 原文时 wrote=false + skipped，不重写文件、不刷备份/manifest 条目（ruler ZedAgent/QwenCodeAgent/GeminiCliAgent 同款 `existingContent === nextContent` 模式）。
