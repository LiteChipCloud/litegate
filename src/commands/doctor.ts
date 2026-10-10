import { homedir } from "node:os";
import { ADAPTERS } from "../adapters/registry.js";
import fs from "node:fs";
import path from "node:path";
import { fetchModelPricing, verifyKey } from "../core/litegate-api.js";

export async function runDoctor(): Promise<void> {
  console.log("\nLiteGate · 诊断\n" + "─".repeat(60));
  for (const a of ADAPTERS) {
    const info = a.detect();
    console.log(`${info.name.padEnd(16)} ${info.present ? "已安装" : "未安装"}  ${info.configPath}`);
    if (info.id === "zcode") {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(homedir(), ".zcode", "v2", "provider_config.json"), "utf8"));
        const rules = cfg?.config?.providerConfigRules?.providerRules ?? [];
        const lg = rules.find((r: any) => r.providerName === "LiteGate");
        if (lg) console.log(`${" ".repeat(16)} └ LiteGate：${(lg.config.personalModelIds ?? []).length} 个模型`);
      } catch {}
    }
  }
  try {
    await fetchModelPricing();
    console.log("LiteGate API     可达 ✓");
    // Key 发现：Claude Code env / ZCode provider / 环境变量
    let key = process.env.LITEGATE_API_KEY ?? "";
    try {
      const cc = JSON.parse(fs.readFileSync(path.join(homedir(), ".claude", "settings.json"), "utf8"));
      key = key || cc?.env?.ANTHROPIC_AUTH_TOKEN || cc?.env?.ANTHROPIC_API_KEY || "";
    } catch {}
    if (!key) {
      try {
        const zc = JSON.parse(fs.readFileSync(path.join(homedir(), ".zcode", "v2", "provider_config.json"), "utf8"));
        const rules = zc?.config?.providerConfigRules?.providerRules ?? [];
        key = rules.find((r: any) => r.providerName === "LiteGate")?.config?.access?.apiKey ?? "";
      } catch {}
    }
    if (key) {
      const v = await verifyKey(key);
      console.log(`Key 烟测          ${v.ok ? "✓ " + v.detail : "✗ " + v.detail} (${key.slice(0, 10)}***)`);
    } else {
      console.log("Key 烟测          ✗ 未发现 Key（Claude Code / ZCode / 环境变量均无）");
    }
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
