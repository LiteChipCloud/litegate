import { fetchModelPricing, isFree, priceLabel } from "../core/litegate-api.js";

export async function runModels(): Promise<void> {
  let models;
  try {
    models = await fetchModelPricing();
  } catch (e) {
    console.error("获取失败：", (e as Error).message);
    process.exit(1);
  }
  console.log("\nLiteGate 可用模型\n" + "─".repeat(72));
  for (const m of models) {
    const tag = isFree(m) ? " [免费]" : "";
    console.log(`${m.modelName.padEnd(24)} ${m.modelKey.padEnd(26)} ${m.billingMode.padEnd(9)} ${priceLabel(m)}${tag}`);
  }
  console.log(`\n共 ${models.length} 个 · token 模型价格单位：元/每百万 token（输入/输出）\n`);
}
