import fs from "node:fs";
import path from "node:path";
import type { LiteGateModel } from "../types.js";

/** Codex model_catalog_json 条目（schema 对齐 2026-10-02 实测可用的目录文件） */
function catalogEntry(m: LiteGateModel, priority: number): Record<string, unknown> {
  return {
    additional_speed_tiers: [],
    apply_patch_tool_type: "freeform",
    availability_nux: null,
    base_instructions: "You are Codex, an AI coding agent.",
    comp_hash: "3000",
    context_window: m.contextWindow,
    default_reasoning_level: "low",
    default_reasoning_summary: "none",
    default_verbosity: "low",
    description: `LiteGate: ${m.modelName}（${priceText(m)}）`,
    display_name: m.modelName,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    include_skills_usage_instructions: false,
    input_modalities: ["text", "image"],
    max_context_window: m.contextWindow,
    model_messages: { instructions_template: "You are Codex, an AI coding agent." },
    multi_agent_version: "v2",
    priority,
    service_tiers: [],
    shell_type: "shell_command",
    slug: m.modelKey,
    support_verbosity: false,
    supported_in_api: true,
    supported_reasoning_levels: [
      { description: "Fast responses with light reasoning", effort: "low" },
      { description: "Balanced reasoning", effort: "medium" },
      { description: "Deep reasoning", effort: "high" },
    ],
    supports_image_detail_original: true,
    supports_parallel_tool_calls: true,
    supports_reasoning_summaries: false,
    supports_search_tool: false,
    tool_mode: "code_mode_only",
    truncation_policy: { limit: 10000, mode: "tokens" },
    upgrade: null,
    use_responses_lite: true,
    visibility: "list",
    web_search_tool_type: "text_and_image",
  };
}

function priceText(m: LiteGateModel): string {
  if (m.billingMode === "per_call") return `¥${m.pricePerCall ?? 0}/次`;
  return `¥${trimNum(m.inputPrice * 1000)}/¥${trimNum(m.outputPrice * 1000)} 每百万`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** 生成 ~/.codex/litegate-model-catalog.json（仅 chat 模型），返回文件路径 */
export function writeCodexCatalog(models: LiteGateModel[], home: string, dryRun: boolean): string {
  const file = path.join(home, ".codex", "litegate-model-catalog.json");
  const catalog = {
    models: models.map((m, i) => catalogEntry(m, 100 - i)),
  };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
  }
  return file;
}
