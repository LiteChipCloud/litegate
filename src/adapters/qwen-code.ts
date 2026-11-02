import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error write-file-atomic 未随包提供类型声明（CJS 包，sync 版本挂在 .sync 上）
import writeFileAtomic from "write-file-atomic";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

/** 原子写（temp 文件 + rename，保留既有 mode/chown），签名同 fs.writeFileSync。 */
const writeFileSyncAtomic: typeof fs.writeFileSync = writeFileAtomic.sync;

const ID = "qwen-code";
const NAME = "Qwen Code";

/**
 * Qwen Code（Gemini CLI fork，已放开第三方端点）配置：~/.qwen/settings.json 的 env 段。
 * 官方加载优先级：shell env > .env 文件 > settings.json env 段——写 env 段是官方支持的
 * 「全配置一个文件」方式，用户自己 export 的值天然优先于我们写入的值。
 * OpenAI 兼容协议三件套：OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL。
 */
function configPath(): string {
  return path.join(homedir(), ".qwen", "settings.json");
}

export const qwenCodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "switch",
  detect(): ToolInstallInfo {
    const p = configPath();
    const dir = path.dirname(p);
    return { id: ID, name: NAME, present: fs.existsSync(dir), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPath();
    let root: Record<string, any> = {};
    let original: string | null = null;
    if (fs.existsSync(file)) {
      try { original = fs.readFileSync(file, "utf8"); root = JSON.parse(original); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` }; }
    }
    root.env ??= {};
    const env = root.env as Record<string, string>;
    const changes: string[] = [];
    const pointsToLiteGate = (env.OPENAI_BASE_URL ?? "").toLowerCase().includes("litechipcloud");
    if (env.OPENAI_BASE_URL && o.mode === "increment" && !pointsToLiteGate) {
      return { ok: true, supported: true, wrote: false, changes: [], skipped: "已存在指向其他服务的 OPENAI_BASE_URL（increment 模式不覆盖）；--mode replace 可覆盖" };
    }
    if (o.mode === "replace" || !env.OPENAI_BASE_URL) {
      env.OPENAI_BASE_URL = o.baseUrlOpenAI;
      changes.push("env.OPENAI_BASE_URL");
    }
    if (o.mode === "replace" || !env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = o.apiKey;
      changes.push("env.OPENAI_API_KEY");
    }
    if (o.mode === "replace" || !env.OPENAI_MODEL) {
      env.OPENAI_MODEL = o.defaultModelKey;
      changes.push(`env.OPENAI_MODEL=${o.defaultModelKey}`);
    }
    root.env = env;
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Qwen Code settings");
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    // 内容已一致则跳过写入（ruler 同款幂等）：不重写文件、不产生新备份/manifest 条目
    if (original === out) return { ok: true, supported: true, wrote: false, changes, skipped: "配置已与目标一致，跳过写入" };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "merge-env");
    writeFileSyncAtomic(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const env = root?.env ?? {};
      const errs: string[] = [];
      if (!env.OPENAI_BASE_URL) errs.push("env.OPENAI_BASE_URL 缺失");
      if (!env.OPENAI_API_KEY) errs.push("env.OPENAI_API_KEY 缺失");
      return errs;
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configPath());
  },
};
