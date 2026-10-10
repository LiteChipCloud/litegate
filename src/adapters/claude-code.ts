import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "claude-code";
const NAME = "Claude Code";

function configPath(): string {
  return path.join(homedir(), ".claude", "settings.json");
}

export const claudeCodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configPath();
    return { id: ID, name: NAME, present: fs.existsSync(path.dirname(p)) || fs.existsSync(p), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPath();
    let obj: Record<string, unknown> = {};
    if (fs.existsSync(file)) {
      try { obj = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` }; }
    }
    const env = (obj.env as Record<string, string> | undefined) ?? {};
    const changes: string[] = [];
    if (env.ANTHROPIC_BASE_URL || env.ANTHROPIC_AUTH_TOKEN) {
      // increment 模式：已有 ANTHROPIC_* 配置（可能指向其他服务），不覆盖，仅提示
      if (o.mode === "increment")
        return { ok: true, supported: true, wrote: false, changes: [], skipped: "已存在 ANTHROPIC_BASE_URL/AUTH_TOKEN 配置（increment 模式不覆盖）；--mode replace 可覆盖" };
    }
    if (o.mode === "replace" || !env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = o.baseUrlAnthropic;
      changes.push("env.ANTHROPIC_BASE_URL");
    }
    if (o.mode === "replace" || !env.ANTHROPIC_AUTH_TOKEN) {
      env.ANTHROPIC_AUTH_TOKEN = o.apiKey;
      changes.push("env.ANTHROPIC_AUTH_TOKEN");
    }
    obj.env = env;
    const out = JSON.stringify(obj, null, 2) + "\n";
    assertValidJSON(out, "Claude Code settings");
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "merge-env");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(o: ConfigureOptions): string[] {
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    try {
      const obj = JSON.parse(fs.readFileSync(p, "utf8"));
      const env = obj.env ?? {};
      const errs: string[] = [];
      if (env.ANTHROPIC_BASE_URL?.replace("//www.", "//") !== o.baseUrlAnthropic.replace("//www.", "//")) errs.push(`ANTHROPIC_BASE_URL != ${o.baseUrlAnthropic}`);
      if (!env.ANTHROPIC_AUTH_TOKEN) errs.push("ANTHROPIC_AUTH_TOKEN 缺失");
      return errs;
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    const p = configPath();
    fs.copyFileSync(backup, p);
  },
};
