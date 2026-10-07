import * as p from "@clack/prompts";
import { ADAPTERS } from "../adapters/registry.js";
import { fetchModelPricing, chatModels, isFree } from "../core/litegate-api.js";
import type { LiteGateModel } from "../types.js";

const BASE_ANTHROPIC = "https://www.litechipcloud.cn";
const BASE_OPENAI = "https://www.litechipcloud.cn/v1";

interface InitOptions {
  mode: string;
  key?: string;
  tools?: string;
  dryRun?: boolean;
  yes?: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  p.intro("LiteGate Cli · 一条命令接入全部 AI 编程工具");

  // 1. 拉取模型目录（公开接口，无需 Key）
  const s0 = p.spinner();
  s0.start("获取 LiteGate 模型目录…");
  let models: LiteGateModel[];
  try {
    models = await fetchModelPricing();
    s0.stop(`LiteGate 模型目录：${models.length} 个（其中免费 ${models.filter(isFree).length} 个）`);
  } catch (e) {
    s0.stop("获取模型目录失败");
    p.log.error(String(e));
    process.exit(1);
  }
  const chat = chatModels(models);

  // 2. Key
  let apiKey = opts.key ?? "";
  if (!apiKey) {
    const r = await p.text({
      message: "粘贴 LiteGate API Key（sk-lcc-…，Console 词元页创建）",
      placeholder: "sk-lcc-…",
      validate: (v) => (v.startsWith("sk-") && v.length > 20) ? undefined : "Key 格式不正确（应以 sk- 开头）",
    });
    if (p.isCancel(r)) { p.cancel("已取消"); process.exit(0); }
    apiKey = r as string;
  }

  // 3. 检测工具
  const s1 = p.spinner();
  s1.start("检测本机 AI 编程工具…");
  const results = ADAPTERS.map((a) => ({ adapter: a, info: a.detect() }));
  s1.stop("检测完成");
  const present = results.filter((r) => r.info.present);
  if (present.length === 0) {
    p.log.warn("未检测到任何受支持的 AI 编程工具");
    process.exit(0);
  }

  let toolIds: string[];
  if (opts.tools) {
    toolIds = opts.tools.split(",").map((x) => x.trim()).filter(Boolean);
    const unknown = toolIds.filter((id) => !present.some((r) => r.info.id === id));
    if (unknown.length) { p.log.error(`未检测到工具：${unknown.join(", ")}`); process.exit(1); }
  } else {
    const selected = await p.multiselect({
      message: "选择要接入 LiteGate 的工具",
      options: present.map((r) => ({
        value: r.info.id,
        label: `${r.info.name}`,
        hint: r.info.configPath,
      })),
      required: true,
    });
    if (p.isCancel(selected)) { p.cancel("已取消"); process.exit(0); }
    toolIds = selected as string[];
  }

  const mode = (opts.mode === "replace" ? "replace" : "increment") as "replace" | "increment";
  if (!opts.yes && !opts.dryRun) {
    const ok = await p.confirm({
      message: `将以 ${mode === "increment" ? "增量" : "替换"}模式写入 ${toolIds.length} 个工具（自动备份，可 rollback），继续？`,
    });
    if (p.isCancel(ok) || !ok) { p.cancel("已取消"); process.exit(0); }
  }

  const s2 = p.spinner();
  const outResults: { tool: string; ok: boolean; changes: string[]; skipped?: string; error?: string }[] = [];
  s2.start("配置中…");
  for (const id of toolIds) {
    const r = results.find((x) => x.info.id === id)!;
    try {
      const res = await r.adapter.configure({
        apiKey,
        baseUrlAnthropic: BASE_ANTHROPIC,
        baseUrlOpenAI: BASE_OPENAI,
        models,
        chatModels: chat,
        defaultModelKey: chat[0]?.modelKey ?? "minimax-m3.1-flash",
        mode,
        dryRun: !!opts.dryRun,
      }, r.info);
      outResults.push({ tool: r.info.name, ok: res.ok, changes: res.changes, skipped: res.skipped, error: res.error });
    } catch (e) {
      outResults.push({ tool: r.info.name, ok: false, changes: [], error: String(e) });
    }
  }
  s2.stop("配置完成");

  // 4. 汇总
  for (const r of outResults) {
    if (r.error) { p.log.error(`${r.tool}: ${r.error}`); continue; }
    if (r.skipped) { p.log.warn(`${r.tool}: ${r.skipped}`); continue; }
    p.log.success(`${r.tool}: ${r.changes.join("，") || "无变更"}`);
  }
  p.log.info(opts.dryRun ? "（dry-run：未写入任何文件）" : "提示：终端环境变量类配置需重开终端生效；`litegate rollback` 可一键回滚");
  p.outro(`🎉 LiteGate 接入完成 · litechipcloud.cn`);
}
