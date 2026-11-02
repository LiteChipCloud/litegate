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

const ID = "crush";
const NAME = "Crush";

/**
 * charmbracelet/crush 配置：~/.config/crush/crush.json（legacy JSON 格式，仍受支持）。
 * 只写 providers.litegate 一个 provider（Coexist），不碰用户既有 providers/权限等字段。
 * 模型列表不手写——crush 对 openai-compat 类型 models 为空时自动 GET /v1/models 发现
 * （官方文档：docs/config/README.md），LiteGate 网关即 OpenAI 兼容。
 */
/**
 * 平台相关配置路径（纯函数，供 detect/TOOLS 与测试复用）：
 * 三平台同构 → <home>/.config/crush/crush.json（legacy JSON 与 crushrc 同目录）。
 * 官方证据（github.com/charmbracelet/crush）：README「%USERPROFILE%\.config\crush\crushrc
 * on Windows」；internal/config/load.go GlobalConfig() = XDG config home/crush/crush.json。
 * 注意：Windows 的 %LOCALAPPDATA%\crush 只是机器态数据目录（providers.json 等 state），
 * Crush 明确不从那里读配置——别混淆。
 */
export function configPathFor(_platform: NodeJS.Platform): string {
  return path.join(homedir(), ".config", "crush", "crush.json");
}

function configFile(): string {
  return configPathFor(process.platform);
}

export const crushAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const p = configFile();
    const dir = path.dirname(p);
    return { id: ID, name: NAME, present: fs.existsSync(dir), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configFile();
    let root: Record<string, any> = {};
    if (fs.existsSync(file)) {
      try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` }; }
    }
    root.providers ??= {};
    root.providers.litegate = {
      name: "LiteGate",
      type: "openai-compat",
      base_url: o.baseUrlOpenAI,
      api_key: o.apiKey,
      // models 留空 → crush 自动从网关 /v1/models 发现全部在售模型
    };
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Crush config");
    const changes = ["providers.litegate（openai-compat，模型自动发现）"];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-provider");
    writeFileSyncAtomic(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const p = configFile();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    try {
      const root = JSON.parse(fs.readFileSync(p, "utf8"));
      const lg = root?.providers?.litegate;
      if (!lg) return ["providers.litegate 缺失"];
      if (!lg.api_key && !lg.base_url) return ["providers.litegate 缺 api_key/base_url"];
      return [];
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configFile());
  },
};
