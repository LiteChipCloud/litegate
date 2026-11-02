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

const ID = "opencode";
const NAME = "OpenCode";

/** configure 对「可读但非标准 JSON」文件的统一拒绝口径（保住用户注释，写入仍保守） */
const JSONC_WRITE_REFUSE = `文件含注释/非标准 JSON，为保住您的注释未自动改写；可在工具内手动添加 provider "litegate"，或移除注释后重跑`;

/**
 * sst/opencode 配置：~/.config/opencode/opencode.json（官方支持 .jsonc，检测到则优先沿用）。
 * 追加 provider.litegate（Coexist），key 直接进 options.apiKey（官方支持，另有 {env:VAR} 语法）。
 * schema 来源：opencode.ai/docs/providers。
 * 读取宽容：jsonc-parser 容忍注释/尾逗号，verify 不再误报；写入保守：非标准 JSON 仍拒绝改写，
 * 绝不 stringify 抹掉用户注释。
 */
/**
 * 平台相关配置路径（纯函数，供 detect/TOOLS 与测试复用）：
 * 三平台同构 → <home>/.config/opencode/opencode.json(.jsonc)。
 * 官方证据：opencode.ai/docs/config——全局配置 ~/.config/opencode/opencode.json；
 * opencode.ai/docs/troubleshooting——Windows 原文「Press WIN+R and paste
 * %USERPROFILE%\.config\opencode\opencode.jsonc」，即 Windows 也在用户目录 .config 下。
 */
export function configPathsFor(_platform: NodeJS.Platform): string[] {
  const dir = path.join(homedir(), ".config", "opencode");
  return [path.join(dir, "opencode.json"), path.join(dir, "opencode.jsonc")];
}

function configPaths(): string[] {
  return configPathsFor(process.platform);
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
      const read = readConfig(fs.readFileSync(file, "utf8"));
      if (!read) return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 无法解析（非 JSON/JSONC），拒绝修改` };
      // 读取宽容、写入保守：注释/尾逗号版能读懂但拒绝自动改写（stringify 全写会抹掉注释）
      if (!read.strict) return { ok: false, supported: true, wrote: false, changes: [], error: `${file} ${JSONC_WRITE_REFUSE}` };
      root = read.root;
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
    writeFileSyncAtomic(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(): string[] {
    const file = configPaths().find((p) => fs.existsSync(p));
    if (!file) return [`${configPaths()[0]} 不存在`];
    const read = readConfig(fs.readFileSync(file, "utf8"));
    if (!read) return [`${file} 无法解析（非 JSON/JSONC），请检查配置文件语法`];
    if (!read.root?.provider?.litegate) return ["provider.litegate 缺失"];
    return [];
  },
  restore(backup: string): void {
    const file = configPaths().find((p) => fs.existsSync(p)) ?? configPaths()[0];
    fs.copyFileSync(backup, file);
  },
};
