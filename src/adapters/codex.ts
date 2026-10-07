import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidTOML } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "codex";
const NAME = "Codex CLI";
const MARK_BEGIN = "# >>> LiteGate begin (managed by @litechipcloud/litegate) <<<";
const MARK_END = "# <<< LiteGate end <<<";

function configFile(): string {
  return path.join(process.env.HOME ?? "", ".codex", "config.toml");
}

export const codexAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configFile();
    return { id: ID, name: NAME, present: fs.existsSync(path.dirname(p)) || fs.existsSync(p), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configFile();
    let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    // 幂等：先移除旧 LiteGate 标记段
    text = text.replace(new RegExp(`${MARK_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MARK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n?`, "g"), "");
    const defaultModel = o.defaultModelKey;
    const block = `${MARK_BEGIN}
model_provider = "litegate"
model = "${defaultModel}"

[model_providers.litegate]
name = "LiteGate"
base_url = "${o.baseUrlOpenAI}"
env_key = "LITEGATE_API_KEY"
wire_api = "responses"
${MARK_END}
`;
    let out = block + text;
    assertValidTOML(out, "Codex config");
    const changes = ["model_provider=litegate", `model=${defaultModel}`, "[model_providers.litegate]"];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "prepend-managed-block");
    fs.writeFileSync(file, out);
    // Key 环境变量：写入 shell rc（标记对幂等）
    const rcFile = process.env.SHELL?.includes("fish") ? null : path.join(process.env.HOME ?? "", process.env.SHELL?.includes("bash") ? ".bashrc" : ".zshrc");
    if (rcFile) {
      let rc = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, "utf8") : "";
      if (!rc.includes("LITEGATE_API_KEY")) {
        const rcBlock = `\n# >>> LiteGate begin (managed by @litechipcloud/litegate) <<<\nexport LITEGATE_API_KEY="${o.apiKey}"\n# <<< LiteGate end <<<\n`;
        backupFile(ID, rcFile, "append-env");
        fs.appendFileSync(rcFile, rcBlock);
        changes.push("shell rc: LITEGATE_API_KEY");
      }
    }
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const p = configFile();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    const errs: string[] = [];
    try {
      const parsed = TOML.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      if (parsed.model_provider !== "litegate") errs.push("model_provider != litegate");
    } catch (e) { errs.push(String(e)); }
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configFile());
  },
};
