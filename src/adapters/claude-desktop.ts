import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
// @ts-expect-error write-file-atomic 未随包提供类型声明（CJS 包，sync 版本挂在 .sync 上）
import writeFileAtomic from "write-file-atomic";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

/** 原子写（temp 文件 + rename，保留既有 mode/chown），签名同 fs.writeFileSync。 */
const writeFileSyncAtomic: typeof fs.writeFileSync = writeFileAtomic.sync;

const ID = "claude-desktop";
const NAME = "Claude Desktop";

/**
 * Claude Desktop（第三方推理 Gateway 模式）配置：
 *   ~/Library/Application Support/Claude-3p/configLibrary/<profileId>.json
 *   当前 profile 由 _meta.json 的 appliedId 指定。
 * 数据目录名可能是 Claude-3p（3p 部署）或 Claude，两者都探测。
 */
/**
 * 平台相关配置路径（纯函数，供 detect/TOOLS 与测试复用）：
 *   darwin → ~/Library/Application Support/Claude-3p/configLibrary（现状保留）
 *   win32 → %APPDATA%\Claude（官方 MCP 文档 modelcontextprotocol.io：Windows 下
 *     claude_desktop_config.json 位于 %APPDATA%\Claude，%APPDATA%=Roaming）。
 *     ⚠️ 该目录只是数据目录证据：configLibrary 推理 profile 结构是 macOS 3p 部署特性，
 *     Windows 是否存在未证实（且新版 Windows 安装形态多样，配置读取位置可能随安装方式漂移）
 *     → Windows 只做安装探测（detect），configure 明确 skipped，不瞎写。
 *   linux/其他 → ""（官方无 Linux 版 Claude Desktop，查无可靠路径 → 返回未知路径而非猜）
 */
export function configPathFor(platform: NodeJS.Platform): string {
  const h = homedir();
  if (platform === "darwin") return path.join(h, "Library", "Application Support", "Claude-3p", "configLibrary");
  if (platform === "win32") return path.join(h, "AppData", "Roaming", "Claude");
  return "";
}

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
  strategy: "switch",
  detect(): ToolInstallInfo {
    if (process.platform === "darwin") {
      const dir = dataDir();
      const p = dir ? profileFile(dir) : null;
      return {
        id: ID,
        name: NAME,
        present: !!dir,
        configPath: p ?? configPathFor("darwin"),
        configExists: !!p,
        detail: dir ? undefined : "未检测到 Claude Desktop 数据目录（需支持 third-party inference 的版本）",
      };
    }
    if (process.platform === "win32") {
      const dir = configPathFor("win32");
      return {
        id: ID,
        name: NAME,
        present: fs.existsSync(dir),
        configPath: dir,
        // configLibrary 推理 profile 在 Windows 未证实 → 不标记已配置
        configExists: false,
        detail: "Windows 暂不支持自动接入：官方仅证实数据目录 %APPDATA%\\Claude（claude_desktop_config.json 属 MCP 配置）；configLibrary 推理 profile 是 macOS 3p 特性，Windows 结构未证实",
      };
    }
    return {
      id: ID,
      name: NAME,
      present: false,
      configPath: configPathFor(process.platform),
      configExists: false,
      detail: `暂不支持 ${process.platform}：官方无该平台版本，配置路径未证实`,
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    if (process.platform === "win32") {
      return {
        ok: false,
        supported: true,
        wrote: false,
        changes: [],
        skipped: "暂不支持 Windows 自动接入：官方仅证实数据目录 %APPDATA%\\Claude（claude_desktop_config.json 属 MCP 配置）；configLibrary 推理 profile 是 macOS 3p 部署特性，Windows 结构未证实，请手动配置",
      };
    }
    if (process.platform !== "darwin") {
      return {
        ok: false,
        supported: true,
        wrote: false,
        changes: [],
        skipped: `暂不支持 ${process.platform} 自动接入：官方无该平台的 Claude Desktop（配置路径未证实），请手动配置`,
      };
    }
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
        writeFileSyncAtomic(metaPath, JSON.stringify({ appliedId: id, entries: [{ id, name: "Default" }] }, null, 2) + "\n");
      }
    } else {
      // 全新安装：创建完整结构
      dir = path.join(homedir(), "Library", "Application Support", "Claude-3p");
      fs.mkdirSync(path.join(dir, "configLibrary"), { recursive: true });
      const id = "litegate-" + Date.now().toString(36);
      profilePath = path.join(dir, "configLibrary", `${id}.json`);
      metaPath = path.join(dir, "configLibrary", "_meta.json");
      writeFileSyncAtomic(metaPath, JSON.stringify({ appliedId: id, entries: [{ id, name: "Default" }] }, null, 2) + "\n");
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
    // 全新 profile 文件尚不存在（新建分支），此时无可备份内容——只对已有文件做备份
    if (fs.existsSync(profilePath)) backupFile(ID, profilePath, "upsert-gateway");
    writeFileSyncAtomic(profilePath, out);
    fs.chmodSync(profilePath, 0o600);
    return { ok: true, supported: true, wrote: true, changes: [`inferenceGateway（${path.basename(profilePath)}，重启 Claude 生效）`] };
  },
  verify(): string[] {
    if (process.platform === "win32") return ["暂不支持 Windows 自动接入（configLibrary 推理 profile 结构未证实），请手动配置"];
    if (process.platform !== "darwin") return [`暂不支持 ${process.platform}（官方无该平台的 Claude Desktop）`];
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
