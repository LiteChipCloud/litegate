import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

const ID = "claude-desktop";
const NAME = "Claude Desktop";

/**
 * Claude Desktop（第三方推理 Gateway 模式）配置：
 *   ~/Library/Application Support/Claude-3p/configLibrary/<profileId>.json
 *   当前 profile 由 _meta.json 的 appliedId 指定。
 * 数据目录名可能是 Claude-3p（3p 部署）或 Claude，两者都探测。
 */
function dataDir(): string | null {
  for (const name of ["Claude-3p", "Claude"]) {
    const d = path.join(homedir(), "Library", "Application Support", name);
    if (fs.existsSync(path.join(d, "configLibrary"))) return d;
  }
  return null;
}

function profileFile(dir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "configLibrary", "_meta.json"), "utf8"));
    if (!meta.appliedId) return null;
    const p = path.join(dir, "configLibrary", `${meta.appliedId}.json`);
    return fs.existsSync(p) ? p : null;
  } catch { return null; }
}

function appRunning(): boolean {
  try {
    return execSync("pgrep -x Claude 2>/dev/null || true").toString().trim().length > 0;
  } catch { return false; }
}

export const claudeDesktopAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const dir = dataDir();
    const p = dir ? profileFile(dir) : null;
    return {
      id: ID,
      name: NAME,
      present: !!dir,
      configPath: p ?? path.join(homedir(), "Library", "Application Support", "Claude-3p", "configLibrary"),
      configExists: !!p,
      detail: dir ? undefined : "未检测到 Claude Desktop 数据目录（需支持 third-party inference 的版本）",
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    if (appRunning()) {
      return { ok: false, supported: true, wrote: false, changes: [], skipped: "Claude 正在运行，请先退出 Claude 再执行（防止内存覆盖配置）" };
    }
    let dir = dataDir();
    let profilePath: string;
    let metaPath: string;
    if (dir) {
      const existing = profileFile(dir);
      metaPath = path.join(dir, "configLibrary", "_meta.json");
      if (existing) {
        profilePath = existing;
      } else {
        // 目录在但没有 profile：新建一个并注册为 applied
        const id = "litegate-" + Date.now().toString(36);
        profilePath = path.join(dir, "configLibrary", `${id}.json`);
        fs.writeFileSync(metaPath, JSON.stringify({ appliedId: id, entries: [{ id, name: "Default" }] }, null, 2) + "\n");
      }
    } else {
      // 全新安装：创建完整结构
      dir = path.join(homedir(), "Library", "Application Support", "Claude-3p");
      fs.mkdirSync(path.join(dir, "configLibrary"), { recursive: true });
      const id = "litegate-" + Date.now().toString(36);
      profilePath = path.join(dir, "configLibrary", `${id}.json`);
      metaPath = path.join(dir, "configLibrary", "_meta.json");
      fs.writeFileSync(metaPath, JSON.stringify({ appliedId: id, entries: [{ id, name: "Default" }] }, null, 2) + "\n");
    }

    let root: Record<string, any> = {};
    if (fs.existsSync(profilePath)) {
      try { root = JSON.parse(fs.readFileSync(profilePath, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${profilePath} 不是合法 JSON，拒绝修改` }; }
    }
    root.inferenceProvider = "gateway";
    root.inferenceCredentialKind = "static";
    root.inferenceGatewayBaseUrl = o.baseUrlAnthropic;
    root.inferenceGatewayApiKey = o.apiKey;

    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Claude Desktop profile");
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes: ["gateway=" + o.baseUrlAnthropic] };
    backupFile(ID, profilePath, "upsert-gateway");
    fs.writeFileSync(profilePath, out);
    fs.chmodSync(profilePath, 0o600);
    return { ok: true, supported: true, wrote: true, changes: [`inferenceGateway（${path.basename(profilePath)}，重启 Claude 生效）`] };
  },
  verify(): string[] {
    const dir = dataDir();
    if (!dir) return [`${NAME} 数据目录不存在`];
    const p = profileFile(dir);
    if (!p) return ["未找到推理 profile（configLibrary/appliedId）"];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const errs: string[] = [];
      if (root.inferenceProvider !== "gateway") errs.push("inferenceProvider != gateway");
      const url: string = root.inferenceGatewayBaseUrl ?? "";
      const key: string = root.inferenceGatewayApiKey ?? "";
      if (!url.includes("litechipcloud.cn")) errs.push(`gateway=${url || "空"} 非 LiteGate`);
      if (!key.startsWith("sk-lcc-")) errs.push("API key 非 LiteGate（sk-lcc-…）");
      return errs;
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    const dir = dataDir();
    const p = dir ? profileFile(dir) : null;
    if (p) fs.copyFileSync(backup, p);
  },
};
