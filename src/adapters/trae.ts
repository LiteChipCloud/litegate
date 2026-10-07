import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";

const ID = "trae";
const NAME = "Trae";

/** TRAE SOLO CN / Trae / Trae CN 等变体的 globalStorage SQLite */
function storageFile(): string | null {
  const base = path.join(process.env.HOME ?? "", "Library", "Application Support");
  try {
    for (const d of fs.readdirSync(base)) {
      if (!/^TRAE/i.test(d)) continue;
      const p = path.join(base, d, "User", "globalStorage", "state.vscdb");
      if (fs.existsSync(p)) return p;
    }
  } catch { /* App Support 不存在 */ }
  return null;
}

function appInstalled(): boolean {
  try {
    return fs.readdirSync("/Applications").some((d) => /^trae/i.test(d));
  } catch { return false; }
}

export const traeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const storage = storageFile();
    return {
      id: ID,
      name: NAME,
      present: appInstalled() || !!storage,
      configPath: storage ?? path.join(process.env.HOME ?? "", "Library", "Application Support", "TRAE SOLO CN", "User", "globalStorage", "state.vscdb"),
      configExists: !!storage,
      detail: "配置在 state.vscdb（SQLite），自定义模型 Key 经 Electron safeStorage 加密，程序化写入待 PoC（docs/tool-config-storage.md）",
    };
  },
  configure(_o: ConfigureOptions): AdapterResult {
    return { ok: false, supported: false, wrote: false, changes: [], skipped: "V0.2 支持：Key 加密写入待 PoC，请先在 Trae 设置 UI 手动添加（provider 选 custom_anthropic_compatible / custom_openai_compatible）" };
  },
  verify(): string[] { return ["程序化写入待 PoC（V0.2）"]; },
  restore(): void {},
};
