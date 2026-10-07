import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { backupFile } from "../core/backup.js";

const ID = "aider";
const NAME = "Aider";

function getEnvPath(): string {
  return path.join(process.env.HOME ?? "", ".env");
}
function getConfPath(): string {
  return path.join(process.env.HOME ?? "", ".aider.conf.yml");
}

export const aiderAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const confP = getConfPath();
    const envP = getEnvPath();
    const present = fs.existsSync(confP) || fs.existsSync(envP);
    return { id: ID, name: NAME, present, configPath: confP, configExists: fs.existsSync(confP) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const changes: string[] = [];
    const envP = getEnvPath();
    let envText = fs.existsSync(envP) ? fs.readFileSync(envP, "utf8") : "";
    for (const kv of Object.entries({ OPENAI_API_BASE: o.baseUrlOpenAI, OPENAI_API_KEY: o.apiKey })) {
      const lineRe = new RegExp(`^#?\\s*${kv[0]}=.*$`, "m");
      if (lineRe.test(envText)) envText = envText.replace(lineRe, `${kv[0]}=${kv[1]}`);
      else envText += (envText.endsWith("\n") || envText === "" ? "" : "\n") + `${kv[0]}=${kv[1]}\n`;
      changes.push(`~/.env ${kv[0]}`);
    }
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    fs.mkdirSync(path.dirname(envP), { recursive: true });
    fs.writeFileSync(envP, envText);
    const confP = getConfPath();
    let confText = fs.existsSync(confP) ? fs.readFileSync(confP, "utf8") : "";
    const modelLine = "model: openai/" + o.defaultModelKey;
    if (/^#?\s*model:.*$/m.test(confText)) confText = confText.replace(/^#?\s*model:.*$/m, modelLine);
    else confText += (confText.endsWith("\n") || confText === "" ? "" : "\n") + modelLine + "\n";
    changes.push("~/.aider.conf.yml model");
    backupFile(ID, confP, "upsert-model");
    fs.mkdirSync(path.dirname(confP), { recursive: true });
    fs.writeFileSync(confP, confText);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const errs: string[] = [];
    const envP = getEnvPath();
    if (!fs.existsSync(envP)) { errs.push("~/.env 不存在"); return errs; }
    const t = fs.readFileSync(envP, "utf8");
    if (!t.includes("OPENAI_API_BASE=")) errs.push("~/.env 缺 OPENAI_API_BASE");
    if (!t.includes("OPENAI_API_KEY=")) errs.push("~/.env 缺 OPENAI_API_KEY");
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, backup.replace(/\.bak-litegate-.*$/, ""));
  },
};
