import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult, LiteGateModel } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "zcode";
const NAME = "ZCode";

function configFile(): string {
  return path.join(process.env.HOME ?? "", ".zcode", "v2", "provider_config.json");
}

interface ProviderRule {
  providerId: string;
  providerName: string;
  config: {
    group: string;
    access: { type: string; apiKey: string };
    api: { type: string; baseUrl: string };
    personalModelIds: string[];
    modelOrder: string[];
  };
}

export const zcodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configFile();
    return { id: ID, name: NAME, present: fs.existsSync(home(".zcode")) || !!process.env.ZCODE_APP_VERSION, configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configFile();
    let root: Record<string, any> = { schemaVersion: 1, config: { providerConfigRules: { providerRules: [] }, modelConfigRules: { providerModelRules: [] } } };
    if (fs.existsSync(file)) {
      try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` }; }
    }
    root.config ??= {};
    root.config.providerConfigRules ??= { providerRules: [] };
    root.config.modelConfigRules ??= { providerModelRules: [] };
    const rules = root.config.providerConfigRules.providerRules as ProviderRule[];
    const chat = o.chatModels;
    const chatIds = chat.map((m) => m.modelKey);

    let existing = rules.find((r) => r.providerName === "LiteGate");
    const isNew = !existing;
    if (!existing) {
      existing = {
        providerId: randomUUID(),
        providerName: "LiteGate",
        config: {
          group: "standard-personal",
          access: { type: "api-key", apiKey: o.apiKey },
          api: { type: "anthropic-messages", baseUrl: o.baseUrlAnthropic },
          personalModelIds: [],
          modelOrder: [],
        },
      };
      rules.push(existing);
    }
    if (o.mode === "replace" || !existing.config.access.apiKey) existing.config.access.apiKey = o.apiKey;
    existing.config.api = { type: "anthropic-messages", baseUrl: o.baseUrlAnthropic };
    existing.config.personalModelIds = chatIds;
    existing.config.modelOrder = chatIds;

    // 模型上下文规则（与 providerId 关联）
    const mRules = root.config.modelConfigRules.providerModelRules;
    for (const m of chat) {
      const found = mRules.find((r: any) => r.modelId === m.modelKey && r.providerId === existing!.providerId);
      if (found) found.config = { properties: { contextWindow: m.contextWindow } };
      else mRules.push({ modelId: m.modelKey, providerId: existing!.providerId, config: { properties: { contextWindow: m.contextWindow } } });
    }

    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "ZCode provider_config");
    const changes = isNew
      ? ["新增 LiteGate providerRule", `personalModelIds×${chatIds.length}`, "modelConfigRules 同步"]
      : ["刷新 LiteGate personalModelIds/modelOrder", "modelConfigRules 同步"];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, isNew ? "add-provider" : "update-provider-models");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const p = configFile();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    const errs: string[] = [];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const rules = root?.config?.providerConfigRules?.providerRules ?? [];
      const lg = rules.find((r: any) => r.providerName === "LiteGate");
      if (!lg) errs.push("LiteGate providerRule 不存在");
      else if (!lg.config?.access?.apiKey) errs.push("LiteGate provider 缺 apiKey");
    } catch (e) { errs.push(String(e)); }
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configFile());
  },
};

function home(...p: string[]): string {
  return path.join(process.env.HOME ?? "", ...p);
}
