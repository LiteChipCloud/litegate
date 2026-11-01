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

/** 非对话模型不进 /model 选择器（Claude Code 只发对话请求）。 */
const NON_CHAT_TYPE = /embedding|image|video|rerank/i;

/** 上下文窗口缩写：1000000 -> "1M"，128000 -> "128K"。 */
function contextLabel(n: number): string {
  if (!n || n <= 0) return "";
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/**
 * Claude Code 2.1+ 的 modelPicker：自定义 /model 选择器的条目与标签。
 *
 * 背景：Claude Code 内置选择器只有 Claude 四档（Default/Opus/Fable/Sonnet/Haiku）。
 * 接入 LiteGate 后这几档指向的模型可能已下线（如 2026-10 Claude 全量下线）或不被网关识别，
 * 用户必须记模型名手打 `/model glm-5.3`。modelPicker 让选择器直接列出网关在售模型。
 *
 * 生效范围（Claude Code 官方约束）：只从 user settings（~/.claude/settings.json）
 * 或 managed/SDK 读取，不读 project checkout → 天然只影响本机。
 * 旧版本 Claude Code 会忽略该字段，无副作用。
 */
function buildModelPicker(o: ConfigureOptions): { options: { model: string; label: string }[] } | null {
  const chat = (o.chatModels ?? []).filter((m) => !NON_CHAT_TYPE.test(m.type ?? ""));
  if (!chat.length) return null;
  return {
    options: chat.map((m) => {
      const ctx = contextLabel(m.contextWindow);
      const isDefault = m.modelKey === o.defaultModelKey;
      return {
        model: m.modelKey,
        label: `${m.modelName}${ctx ? ` · ${ctx}` : ""}${isDefault ? "（默认）" : ""}`,
      };
    }),
  };
}

export const claudeCodeAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "switch",
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
    const pointsToLiteGate = (env.ANTHROPIC_BASE_URL ?? "").toLowerCase().includes("litechipcloud");
    if ((env.ANTHROPIC_BASE_URL || env.ANTHROPIC_AUTH_TOKEN) && o.mode === "increment" && !pointsToLiteGate) {
      // increment 模式：已有 ANTHROPIC_* 指向其他服务，不覆盖、也不塞 LiteGate 的 modelPicker
      // （否则选择器列出 LiteGate 模型，实际请求却发往别处，误导用户）。
      return { ok: true, supported: true, wrote: false, changes: [], skipped: "已存在指向其他服务的 ANTHROPIC_BASE_URL/AUTH_TOKEN（increment 模式不覆盖）；--mode replace 可覆盖" };
    }
    // 已接 LiteGate 时（pointsToLiteGate）env 无需重复写，但下面的 modelPicker 仍要同步，
    // 这样 `litegate init` 可重复执行来刷新模型清单。
    if (o.mode === "replace" || !env.ANTHROPIC_BASE_URL) {
      env.ANTHROPIC_BASE_URL = o.baseUrlAnthropic;
      changes.push("env.ANTHROPIC_BASE_URL");
    }
    if (o.mode === "replace" || !env.ANTHROPIC_AUTH_TOKEN) {
      env.ANTHROPIC_AUTH_TOKEN = o.apiKey;
      changes.push("env.ANTHROPIC_AUTH_TOKEN");
    }
    // 隐私加固：关掉 Claude Code 的非必要流量（错误上报/反馈问卷/市场检查/自动更新检查）。
    // 对话/代码本来就只发 ANTHROPIC_BASE_URL（= LiteGate），此开关让"其余"流量也归零。
    // 用户已显式设值（"1"=已加固跳过，"0"=想开遥测则尊重）都不动，只补未设置的。
    const PRIVACY_KEY = "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC";
    if (env[PRIVACY_KEY] === undefined) {
      env[PRIVACY_KEY] = "1";
      changes.push(`env.${PRIVACY_KEY}（隐私加固）`);
    }
    obj.env = env;
    // 同步 /model 选择器（Claude Code 2.1+）。increment 模式下若用户已有环境变量
    // 指向其他服务则不改 env，但 modelPicker 仍写入——它只影响选择器展示，不改变路由。
    const picker = buildModelPicker(o);
    if (picker) {
      obj.modelPicker = picker;
      changes.push(`modelPicker（${picker.options.length} 个模型）`);
    }
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
      // 选择器未同步时 /model 仍显示 Claude 四档（其中多数可能已下线），提示但不阻断
      const opts = (obj.modelPicker as { options?: unknown[] } | undefined)?.options;
      if (!Array.isArray(opts) || opts.length === 0) errs.push("modelPicker 未写入（/model 菜单将回退到内置 Claude 档位）");
      return errs;
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    const p = configPath();
    fs.copyFileSync(backup, p);
  },
};
