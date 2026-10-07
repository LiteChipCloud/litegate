import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { Command } from "commander";
import { fetchModelPricing } from "../core/litegate-api.js";
import { backupFile, readManifest } from "../core/backup.js";

const BASE_ANTHROPIC = "https://www.litechipcloud.cn";

function patchClaudeCode(model: string): string | null {
  const p = path.join(process.env.HOME ?? "", ".claude", "settings.json");
  if (!fs.existsSync(p)) return null;
  const obj = JSON.parse(fs.readFileSync(p, "utf8"));
  obj.model = model;
  obj.env = obj.env ?? {};
  backupFile("claude-code", p, `switch-model:${model}`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return p;
}

function patchCodex(model: string): string | null {
  const p = path.join(process.env.HOME ?? "", ".codex", "config.toml");
  if (!fs.existsSync(p)) return null;
  let text = fs.readFileSync(p, "utf8");
  if (!text.includes('model_provider = "litegate"')) return null;
  // 替换 LiteGate 标记段内的 model 行
  text = text.replace(/(model_provider = "litegate"\n)model = "[^"]*"/, `$1model = "${model}"`);
  if (!text.includes(`model = "${model}"`)) return null;
  backupFile("codex", p, `switch-model:${model}`);
  fs.writeFileSync(p, text);
  return p;
}

function patchZCode(model: string): string | null {
  const p = path.join(process.env.HOME ?? "", ".zcode", "v2", "provider_config.json");
  if (!fs.existsSync(p)) return null;
  const root = JSON.parse(fs.readFileSync(p, "utf8"));
  const rules = root?.config?.providerConfigRules?.providerRules ?? [];
  const lg = rules.find((r: any) => r.providerName === "LiteGate");
  if (!lg) return null;
  const rest = (lg.config.personalModelIds as string[]).filter((m) => m !== model);
  lg.config.personalModelIds = [model, ...rest];
  lg.config.modelOrder = [model, ...rest];
  backupFile("zcode", p, `switch-model:${model}`);
  fs.writeFileSync(p, JSON.stringify(root, null, 2) + "\n");
  return p;
}

export function runSwitch(model: string): void {
  // 校验模型存在于 LiteGate 目录
  fetchModelPricing().then((models) => {
    const known = models.find((m) => m.modelKey === model);
    if (!known) {
      console.error(`✗ 模型 ${model} 不在 LiteGate 目录中（litegate models 查看列表）`);
      process.exit(1);
    }
    const results: string[] = [];
    const cc = patchClaudeCode(model);
    results.push(cc ? `✔ Claude Code (${cc})` : "– Claude Code：未检测到配置，跳过");
    const cx = patchCodex(model);
    results.push(cx ? `✔ Codex CLI (${cx})` : "– Codex CLI：未检测到 LiteGate profile，跳过");
    const zc = patchZCode(model);
    results.push(zc ? `✔ ZCode (${zc})` : "– ZCode：未检测到 LiteGate provider，跳过");
    console.log("\nLiteGate · 默认模型切换 → " + model + "\n" + "─".repeat(60));
    for (const r of results) console.log(r);
    console.log("\n提示：Claude Code 重启生效；Codex 重启生效；ZCode 新会话生效\n");
  });
}
