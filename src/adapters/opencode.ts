import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "opencode";
const NAME = "OpenCode";

/**
 * sst/opencode 配置：~/.config/opencode/opencode.json（官方支持 .jsonc，检测到则优先沿用）。
 * 追加 provider.litegate（Coexist），key 直接进 options.apiKey（官方支持，另有 {env:VAR} 语法）。
 * schema 来源：opencode.ai/docs/providers。
 */
function configPaths(): string[] {
  const dir = path.join(homedir(), ".config", "opencode");
  return [path.join(dir, "opencode.json"), path.join(dir, "opencode.jsonc")];
}

export const opencodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const dir = path.join(homedir(), ".config", "opencode");
    const existing = configPaths().find((p) => fs.existsSync(p));
    return {
      id: ID,
      name: NAME,
      present: fs.existsSync(dir),
      configPath: existing ?? configPaths()[0],
      configExists: !!existing,
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPaths().find((p) => fs.existsSync(p)) ?? configPaths()[0];
    let root: Record<string, any> = {};
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8");
      try {
        root = JSON.parse(text);
      } catch {
        // .jsonc 允许注释：标准 JSON 解析失败即拒绝（绝不含糊地改写用户带注释的文件）
        return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 含注释或非标准 JSON，拒绝修改（请在 OpenCode 内手动添加 provider "litegate"）` };
      }
    }
    root.provider ??= {};
    const models: Record<string, unknown> = {};
    for (const m of o.chatModels) {
      models[m.modelKey] = { name: m.modelName, limit: { context: m.contextWindow } };
    }
    root.provider.litegate = {
      npm: "@ai-sdk/openai-compatible",
      name: "LiteGate",
      options: { baseURL: o.baseUrlOpenAI, apiKey: o.apiKey },
      models,
    };
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "OpenCode config");
    const changes = [`provider.litegate（模型×${o.chatModels.length}）`];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-provider");
    fs.writeFileSync(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const file = configPaths().find((p) => fs.existsSync(p));
    if (!file) return [`${configPaths()[0]} 不存在`];
    try {
      const root = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!root?.provider?.litegate) return ["provider.litegate 缺失"];
      return [];
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    const file = configPaths().find((p) => fs.existsSync(p)) ?? configPaths()[0];
    fs.copyFileSync(backup, file);
  },
};
