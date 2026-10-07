import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "continue";
const NAME = "Continue";

function configPath(): string {
  return path.join(process.env.HOME ?? "", ".continue", "config.json");
}

export const continueAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configPath();
    return { id: ID, name: NAME, present: fs.existsSync(path.dirname(p)), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPath();
    let root: Record<string, any> = { models: [] };
    if (fs.existsSync(file)) {
      try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` }; }
    }
    root.models ??= [];
    const changes: string[] = [];
    for (const m of o.chatModels) {
      const entry = {
        title: `LiteGate ${m.modelName}`,
        provider: "openai",
        model: m.modelKey,
        apiBase: o.baseUrlOpenAI,
        apiKey: o.apiKey,
      };
      const found = root.models.find((x: any) => x.model === m.modelKey && (x.apiBase ?? "").includes("litechipcloud.cn"));
      if (found) Object.assign(found, entry);
      else root.models.push(entry);
      changes.push(`+${m.modelKey}`);
    }
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Continue config");
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-models");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(o: ConfigureOptions): string[] {
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    const errs: string[] = [];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const lg = (root.models ?? []).filter((x: any) => (x.apiBase ?? "").includes("litechipcloud.cn"));
      if (lg.length === 0) errs.push("无 LiteGate 模型条目");
    } catch (e) { errs.push(String(e)); }
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configPath());
  },
};
