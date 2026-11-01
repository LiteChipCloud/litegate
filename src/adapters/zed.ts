import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "zed";
const NAME = "Zed";
const KEY_ENV = "LITEGATE_API_KEY";

/**
 * Zed 配置：~/.config/zed/settings.json。
 * 官方约束（zed.dev/docs/ai/use-api-access）：
 *   - openai_compatible.<provider-id> 配 api_url + available_models；
 *   - API key 禁止写入 settings.json——从环境变量读，
 *     变量名由 provider id 派生：`litegate` → LITEGATE_API_KEY（大写下划线 + _API_KEY）。
 * 因此本适配器只写 provider 与模型表，key 交给用户设 env（verify 会检查并提示）。
 * settings.json 是 Zed 主配置且允许 JSONC 注释：解析失败一律拒绝修改，绝不破坏用户文件。
 */
function configPath(): string {
  return path.join(homedir(), ".config", "zed", "settings.json");
}

export const zedAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const p = configPath();
    const dir = path.dirname(p);
    return {
      id: ID,
      name: NAME,
      present: fs.existsSync(dir),
      configPath: p,
      configExists: fs.existsSync(p),
      detail: `API key 走环境变量 ${KEY_ENV}（Zed 官方不允许写入 settings.json）`,
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPath();
    let root: Record<string, any> = {};
    if (fs.existsSync(file)) {
      try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 含注释或非标准 JSON，拒绝修改（Zed 支持 JSONC；请在 Zed 设置内手动添加 LiteGate provider）` }; }
    }
    root.language_models ??= {};
    root.language_models.openai_compatible ??= {};
    const available = o.chatModels.map((m) => ({
      name: m.modelKey,
      display_name: m.modelName,
      max_tokens: m.contextWindow,
    }));
    root.language_models.openai_compatible.litegate = {
      api_url: o.baseUrlOpenAI,
      available_models: available,
    };
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Zed settings");
    const changes = [
      `language_models.openai_compatible.litegate（模型×${available.length}）`,
      `API key：请设置环境变量 ${KEY_ENV}（Zed 官方要求 key 不入 settings.json）`,
    ];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-provider");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const errs: string[] = [];
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const lg = root?.language_models?.openai_compatible?.litegate;
      if (!lg) errs.push("openai_compatible.litegate 缺失");
    } catch (e) { errs.push(String(e)); }
    if (!process.env[KEY_ENV]) errs.push(`环境变量 ${KEY_ENV} 未设置（Zed 不支持配置文件内放 key，请在 shell profile 里 export）`);
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configPath());
  },
};
