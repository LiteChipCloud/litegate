import { ADAPTERS } from "../adapters/registry.js";
import fs from "node:fs";
import path from "node:path";
import { fetchModelPricing } from "../core/litegate-api.js";

export async function runDoctor(): Promise<void> {
  console.log("\nLiteGate · 诊断\n" + "─".repeat(60));
  for (const a of ADAPTERS) {
    const info = a.detect();
    console.log(`${info.name.padEnd(16)} ${info.present ? "已安装" : "未安装"}  ${info.configPath}`);
    if (info.id === "zcode") {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME ?? "", ".zcode", "v2", "provider_config.json"), "utf8"));
        const rules = cfg?.config?.providerConfigRules?.providerRules ?? [];
        const lg = rules.find((r: any) => r.providerName === "LiteGate");
        if (lg) console.log(`${" ".repeat(16)} └ LiteGate：${(lg.config.personalModelIds ?? []).length} 个模型`);
      } catch {}
    }
  }
  try {
    await fetchModelPricing();
    console.log("LiteGate API     可达 ✓");
  } catch {
    console.log("LiteGate API     ✗ 不可达（检查网络/代理）");
  }
  try {
    const res = await fetch("https://www.litechipcloud.cn", { method: "HEAD", signal: AbortSignal.timeout(8000) });
    console.log(`控制台           HTTP ${res.status}`);
  } catch {
    console.log("控制台           ✗ 不可达");
  }
  console.log();
}
