import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";
// @ts-expect-error write-file-atomic 未随包提供类型声明（CJS 包，sync 版本挂在 .sync 上）
import writeFileAtomic from "write-file-atomic";

/** 原子写（temp 文件 + rename，保留既有 mode/chown），签名同 fs.writeFileSync。 */
const writeFileSyncAtomic: typeof fs.writeFileSync = writeFileAtomic.sync;

const ID = "zed";
const NAME = "Zed";
const KEY_ENV = "LITEGATE_API_KEY";

/** configure 对「可读但非标准 JSON」文件的统一拒绝口径（保住用户注释，写入仍保守） */
const JSONC_WRITE_REFUSE = `文件含注释/非标准 JSON，为保住您的注释未自动改写；可在工具内手动添加 provider "litegate"，或移除注释后重跑`;

/**
 * Zed 配置：~/.config/zed/settings.json。
 * 官方约束（zed.dev/docs/ai/use-api-access）：
 *   - openai_compatible.<provider-id> 配 api_url + available_models；
 *   - API key 禁止写入 settings.json——从环境变量读，
 *     变量名由 provider id 派生：`litegate` → LITEGATE_API_KEY（大写下划线 + _API_KEY）。
 * 因此本适配器只写 provider 与模型表，key 交给用户设 env（verify 会检查并提示）。
 * settings.json 是 Zed 主配置且允许 JSONC 注释：**读取宽容**（jsonc-parser 容忍注释/尾逗号，
 * verify 不再误报），**写入保守**（非标准 JSON 一律拒绝改写，绝不 stringify 抹掉用户注释）。
 */
/**
 * 平台相关配置路径（纯函数，供 detect/TOOLS 与测试复用）：
 *   darwin/linux → ~/.config/zed/settings.json（同为 XDG，合并分支；darwin 现状保留）
 *   win32 → %APPDATA%\Zed\settings.json
 *     官方证据：zed.dev/docs/git——全局 AGENTS.md「~/.config/zed/AGENTS.md on macOS and
 *     Linux, %APPDATA%\Zed\AGENTS.md on Windows」；zed.dev/docs/debugger——debug.json 与
 *     用户 settings.json 同目录，Windows 为 %APPDATA%\Zed\debug.json（%APPDATA%=Roaming）。
 * Windows 布局按默认用户目录拼装（C:\Users\<user>\AppData\Roaming），不读 env，保证纯函数可测。
 */
export function configPathFor(platform: NodeJS.Platform): string {
  const h = homedir();
  if (platform === "win32") return path.join(h, "AppData", "Roaming", "Zed", "settings.json");
  // darwin / linux（XDG Base Directory，默认 ~/.config/zed）
  return path.join(h, ".config", "zed", "settings.json");
}

function configPath(): string {
  return configPathFor(process.platform);
}

/**
 * 宽容读取用户配置：注释/尾逗号均可解析（allowTrailingComma）。
 * 返回 null = 真不可解析（语法损坏/根不是对象）→ 拒绝修改；
 * strict=false = 内容可读但非标准 JSON（含注释或尾逗号）→ 可用于读取校验，configure 写入仍拒绝。
 */
function readConfig(text: string): { root: Record<string, any>; strict: boolean } | null {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || parsed === undefined || typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  let strict = true;
  try { JSON.parse(text); } catch { strict = false; }
  return { root: parsed as Record<string, any>, strict };
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
      const read = readConfig(fs.readFileSync(file, "utf8"));
      if (!read) return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 无法解析（非 JSON/JSONC），拒绝修改` };
      if (!read.strict) return { ok: false, supported: true, wrote: false, changes: [], error: `${file} ${JSONC_WRITE_REFUSE}` };
      root = read.root;
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
    writeFileSyncAtomic(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const errs: string[] = [];
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    const read = readConfig(fs.readFileSync(p, "utf8"));
    if (!read) errs.push(`${p} 无法解析（非 JSON/JSONC），请检查 settings.json 语法`);
    else {
      const lg = read.root?.language_models?.openai_compatible?.litegate;
      if (!lg) errs.push("openai_compatible.litegate 缺失");
    }
    if (!process.env[KEY_ENV]) errs.push(`环境变量 ${KEY_ENV} 未设置（Zed 不支持配置文件内放 key，请在 shell profile 里 export）`);
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configPath());
  },
};
