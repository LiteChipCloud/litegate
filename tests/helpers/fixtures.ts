import type { ConfigureOptions, LiteGateModel } from "../../src/types.js";

/** 对齐 README「模型与定价（2026-10-31 起）」的 10 款样例（价格单位：元/千 token） */
export function sampleModels(): LiteGateModel[] {
  return [
    m("glm-5.3-flash", "GLM-5.3-Flash", "chat", 0.00038, 0.00133, 1_000_000),
    m("glm-5.3", "GLM-5.3", "chat", 0.0072, 0.0252, 1_000_000),
    m("deepseek-flash", "DeepSeek Flash（4.1）", "chat", 0.001, 0.004, 1_000_000),
    m("deepseek-v4-pro", "DeepSeek V4 Pro", "chat", 0.005, 0.015, 1_000_000),
    m("minimax-m3.1-flash", "MiniMax M3.1-Flash", "chat", 0.002, 0.008, 1_000_000),
    m("minimax-m3", "MiniMax M3", "chat", 0.0021, 0.0084, 1_000_000),
    m("agnes-3.0", "Agnes 3.0", "chat", 0, 0, 128_000),
    m("agnes-2.5-flash", "Agnes 2.5 Flash", "chat", 0, 0, 128_000),
    m("agnes-image-2.5", "Agnes 图像 2.5", "image", 0, 0, 0, "per_call", 0),
    m("wemm-embedding-2b", "WeMM-Embedding-2B", "embedding", 0, 0, 0, "per_call", 0.2085),
  ];
}

function m(
  modelKey: string,
  modelName: string,
  type: string,
  inputPrice: number,
  outputPrice: number,
  contextWindow: number,
  billingMode: "token" | "per_call" = "token",
  pricePerCall: number | null = null,
): LiteGateModel {
  return { modelKey, modelName, platform: "litegate", type, billingMode, inputPrice, outputPrice, contextWindow, pricePerCall };
}

/** 样例中的 chat 模型（8 个，排除 image/embedding） */
export function sampleChatModels(): LiteGateModel[] {
  return sampleModels().filter((x) => x.type === "chat");
}

const BASE_ANTHROPIC = "https://www.litechipcloud.cn";
const BASE_OPENAI = "https://www.litechipcloud.cn/v1";

/** 构造与 src/commands/init.ts 实际传参同构的 ConfigureOptions，按需覆盖 */
export function makeOptions(overrides: Partial<ConfigureOptions> = {}): ConfigureOptions {
  const models = overrides.models ?? sampleModels();
  return {
    apiKey: "sk-lcc-test-key-000000000000",
    baseUrlAnthropic: BASE_ANTHROPIC,
    baseUrlOpenAI: BASE_OPENAI,
    models,
    chatModels: overrides.chatModels ?? models.filter((x) => x.type === "chat"),
    defaultModelKey: overrides.defaultModelKey ?? "glm-5.3-flash",
    mode: "increment",
    dryRun: false,
    ...overrides,
  };
}

/** 读写文件的小工具（断言落盘内容用） */
import fs from "node:fs";

export function readJSON(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
