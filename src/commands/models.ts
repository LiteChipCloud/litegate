import { fetchModelPricing, isFree, priceLabel, sortByPrice } from "../core/litegate-api.js";

/** 终端显示宽度（CJK 全角记 2），padEnd 按 JS 字符数算会对不齐 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  }
  return w;
}

function pad(s: string, n: number): string {
  const w = displayWidth(s);
  return w >= n ? s : s + " ".repeat(n - w);
}

export async function runModels(sort: string): Promise<void> {
  let models;
  try {
    models = await fetchModelPricing();
  } catch (e) {
    console.error("获取失败：", (e as Error).message);
    process.exit(1);
  }
  if (sort === "name") models.sort((a, b) => a.modelKey.localeCompare(b.modelKey));
  else if (sort !== "type") models = sortByPrice(models); // 默认按实时价格

  const typeTag = (t: string) => (t === "chat" ? "" : ` [${t}]`);
  console.log("\nLiteGate 可用模型（实时价格，" + (sort === "name" ? "按名称" : sort === "type" ? "按类型" : "按价格") + "排序）\n" + "─".repeat(80));
  models.forEach((m, i) => {
    const tag = (isFree(m) ? " [免费]" : "") + typeTag(m.type);
    console.log(
      `${String(i + 1).padStart(2)}. ${pad(m.modelName, 26)} ${pad(m.modelKey, 22)} ${pad(priceLabel(m), 15)}${tag}`,
    );
  });
  const free = models.filter(isFree).length;
  console.log(`\n共 ${models.length} 个（免费 ${free} 个）· token 模型价格单位：元/每百万 token（输入/输出）\n`);
}
