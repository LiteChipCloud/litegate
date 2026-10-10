import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidYAML } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "minimax-code";
const NAME = "MiniMax Code";

function configFile(): string {
  return path.join(homedir(), ".minimax", "config.yaml");
}

export const minimaxCodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configFile();
    return { id: ID, name: NAME, present: fs.existsSync(path.dirname(p)), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configFile();
    let root: Record<string, any> = { logLevel: "info", provider: {} };
    if (fs.existsSync(file)) {
      try { root = yaml.load(fs.readFileSync(file, "utf8")) as Record<string, any>; }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 YAML，拒绝修改` }; }
    }
    root.provider ??= {};
    const chat = o.chatModels;
    const models: Record<string, unknown> = {};
    for (const m of chat) {
      models[m.modelKey] = {
        name: m.modelName,
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: m.contextWindow, output: 16384 },
        modalities: { input: ["text"], output: ["text"] },
      };
    }
    root.provider.litegate = {
      name: "LiteGate",
      npm: "@ai-sdk/anthropic",
      options: { apiKey: o.apiKey, baseURL: o.baseUrlAnthropic },
      models,
      model_order: chat.map((m) => m.modelKey),
      whitelist: chat.map((m) => m.modelKey),
    };
    const out = yaml.dump(root, { lineWidth: 120, noRefs: true });
    assertValidYAML(out, "MiniMax Code config");
    const changes = ["provider.litegate（含模型×" + chat.length + "）"];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-provider");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(o: ConfigureOptions): string[] {
    const p = configFile();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    const errs: string[] = [];
    try {
      const root = yaml.load(fs.readFileSync(p, "utf8")) as any;
      if (!root?.provider?.litegate) errs.push("provider.litegate 缺失");
    } catch (e) { errs.push(String(e)); }
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configFile());
  },
};
