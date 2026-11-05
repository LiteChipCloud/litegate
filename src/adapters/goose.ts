import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
// @ts-expect-error write-file-atomic 未随包提供类型声明（CJS 包，sync 版本挂在 .sync 上）
import writeFileAtomic from "write-file-atomic";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

/** 原子写（temp 文件 + rename，保留既有 mode/chown），签名同 fs.writeFileSync。 */
const writeFileSyncAtomic: typeof fs.writeFileSync = writeFileAtomic.sync;

const ID = "goose";
const NAME = "Goose";
const KEY_ENV = "LITEGATE_API_KEY";

/**
 * Block/goose 自定义 provider：custom_providers/<name>.json（一文件一 provider）。
 * schema 来源（github.com/aaif-goose/goose 源码，2026-11-05 深查）：
 *   - 结构体 DeclarativeProviderConfig：crates/goose-providers/src/declarative.rs:154-205
 *     （name/engine/display_name 必填；api_key_env serde default=""；requires_auth
 *     serde default=true；description/headers/timeout_seconds/supports_streaming 等可省）
 *   - engine 枚举仅三值："openai"（alias openai_compatible）/"anthropic"/"ollama"
 *     （declarative.rs:101-123）；openai 引擎即 OpenAI 兼容 chat completions。
 *   - models[] 条目 ModelInfo：crates/goose-provider-types/src/base.rs:250-288——
 *     仅 name 必填，context_limit/价格字段（USD/token）全部可省；官方文档示例即
 *     {name, context_limit}（documentation/docs/getting-started/providers.md:527-536）。
 *   - base_url 语义宽容：derive_base_path（crates/goose-providers/src/openai.rs:1070-1084）
 *     对 /v1 结尾自动拼 /chat/completions，对完整 chat/completions URL 原样使用——
 *     两种官方示例形态都合法；本适配器写 /v1 形态（与其它适配器同源 baseUrlOpenAI）。
 *   - 目录：crates/goose/src/config/declarative_providers.rs:22-24 =
 *     Paths::config_dir()/custom_providers；etcetera 0.11 choose_app_strategy
 *     在 macOS/Linux 走 XDG（~/.config/goose）、Windows 走
 *     %APPDATA%\Block\goose\config——与官方文档 providers.md:517-519 一字不差。
 *   - ⚠️ 加载纪律：load_custom_providers（declarative.rs:342-358）读取目录下全部 *.json，
 *     任一文件解析失败会让**整个**自定义 provider 目录加载失败——所以坏 JSON 绝不能写出去。
 * Key 走环境变量（与 Zed 同款语义，官方背书）：
 *   - api_key_env 的解析链 Config::get_secret（crates/goose/src/config/base.rs）：
 *     先查 OS 环境变量（key 大写），再查 keyring/secrets.yaml——即 export LITEGATE_API_KEY
 *     即生效，无需碰 keyring；
 *   - 官方文档对文件式 custom provider 的指引就是 export（providers.md:551-556）；
 *   - `goose configure` 无 set-secret 子命令（goose-cli/src/cli.rs:808-810，纯交互式），
 *     keyring/secrets.yaml 写入无法程序化安全完成 → 适配器只写 api_key_env 名字，
 *     key 交给用户 export（verify 检查并提示）。
 */
/**
 * 平台相关配置路径（纯函数，供 detect/TOOLS 与测试复用）：
 *   darwin/linux → ~/.config/goose/custom_providers/litegate.json（XDG，
 *     官方文档 providers.md:518「macOS/Linux: ~/.config/goose/custom_providers/」；
 *     etcetera 0.11 在 macOS 的 choose_app_strategy 同样返回 Xdg 策略）
 *   win32 → %APPDATA%\Block\goose\config\custom_providers\litegate.json
 *     （etcetera windows.rs：config_dir = RoamingAppData\{author}\{app_name}\config，
 *     author="Block" app_name="goose"；官方文档 providers.md:519 同）
 * Windows 布局按默认用户目录拼装（C:\Users\<user>\AppData\Roaming），不读 env，保证纯函数可测。
 */
export function configPathFor(platform: NodeJS.Platform): string {
  const h = homedir();
  if (platform === "win32") {
    return path.join(h, "AppData", "Roaming", "Block", "goose", "config", "custom_providers", "litegate.json");
  }
  // darwin / linux（XDG Base Directory，默认 ~/.config/goose）
  return path.join(h, ".config", "goose", "custom_providers", "litegate.json");
}

function configPath(): string {
  return configPathFor(process.platform);
}

/** goose 的配置根目录（detect 判「装没装」用）：unix ~/.config/goose，win32 %APPDATA%\Block\goose\config */
function gooseConfigDir(): string {
  return path.dirname(path.dirname(configPath()));
}

/** 与 src/core/detect.ts 同款 cmdExists 模式（本机无 goose 命令时返回 false，走纯文件分支） */
function cmdExists(cmd: string): boolean {
  try {
    if (process.platform === "win32") {
      // Windows：cmd.exe 无 POSIX command -v，用 where
      execSync(`where ${cmd}`, { stdio: "ignore" });
    } else {
      execSync(`command -v ${cmd}`, { shell: "/bin/zsh", stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

/** models[] 条目 upsert：同名字段合并（保留用户价格/能力字段），外来条目原样保留（Coexist）。
 *  对齐 goose update_custom_provider 的元数据保留语义
 *  （crates/goose/src/config/declarative_providers.rs:291-325）。 */
function mergeModels(existing: unknown, chatModels: ConfigureOptions["chatModels"]): Record<string, unknown>[] {
  const prev = Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [];
  const byName = new Map(prev.map((m) => [String(m?.name), m]));
  const ours = chatModels.map((m) => {
    const old = byName.get(m.modelKey);
    return { ...(old ?? {}), name: m.modelKey, context_limit: m.contextWindow };
  });
  const ourNames = new Set(chatModels.map((m) => m.modelKey));
  const foreign = prev.filter((m) => !ourNames.has(String(m?.name)));
  return [...ours, ...foreign];
}

export const gooseAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const p = configPath();
    const providersDir = path.dirname(p);
    const base = gooseConfigDir();
    return {
      id: ID,
      name: NAME,
      present: fs.existsSync(providersDir) || fs.existsSync(base) || cmdExists("goose"),
      configPath: p,
      configExists: fs.existsSync(p),
      detail: `API key 走环境变量 ${KEY_ENV}（goose 优先读 OS env，其次 keyring/secrets.yaml）`,
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    const file = configPath();
    let root: Record<string, any> = {};
    let original: string | null = null;
    if (fs.existsSync(file)) {
      try {
        original = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(original);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 根不是 JSON 对象（goose 要求 provider 定义为对象），拒绝修改` };
        }
        root = parsed;
      } catch {
        // goose 的 load_custom_providers 会因目录里任一坏文件连累全部 custom provider，
        // 绝不能用「重建」掩盖（ruler 的 Crush 教训：吞解析异常静默重建会清掉用户数据）
        return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改（坏文件会让 goose 加载整个 custom_providers 目录失败）` };
      }
    }
    // LiteGate 管理的字段（coexist：description/headers/timeout_seconds/supports_streaming
    // 等用户自定义字段一字不动）
    root.name = "litegate"; // provider id，须满足 goose validate_provider_id（小写/数字/_/-）
    root.engine = "openai"; // 官方枚举三值之一，OpenAI 兼容 chat completions
    root.display_name = "LiteGate";
    root.api_key_env = KEY_ENV;
    root.base_url = o.baseUrlOpenAI;
    root.requires_auth = true;
    root.models = mergeModels(root.models, o.chatModels);
    const out = JSON.stringify(root, null, 2) + "\n";
    assertValidJSON(out, "Goose custom provider");
    const changes = [
      `custom_providers/litegate.json（engine=openai，模型×${o.chatModels.length}）`,
      `API key：请设置环境变量 ${KEY_ENV}（goose 官方文件式 provider 指引即 export；缺失时 goose 启动会报 Required API key）`,
    ];
    if (o.dryRun) return { ok: true, supported: true, wrote: false, changes };
    // 内容已一致则跳过写入（ruler 同款幂等）：不重写文件、不产生新备份/manifest 条目
    if (original === out) return { ok: true, supported: true, wrote: false, changes, skipped: "配置已与目标一致，跳过写入" };
    if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
    else backupFile(ID, file, "upsert-provider");
    writeFileSyncAtomic(file, out);
    return { ok: true, supported: true, wrote: true, changes };
  },
  verify(o: ConfigureOptions): string[] {
    const errs: string[] = [];
    const p = configPath();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    let root: Record<string, any>;
    try {
      root = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return [`${p} 无法解析（非 JSON），请检查文件语法（坏文件会让 goose 加载整个 custom_providers 目录失败）`];
    }
    if (root?.name !== "litegate" || root?.engine !== "openai" || !Array.isArray(root?.models) || root.models.length === 0) {
      errs.push("provider litegate 定义缺失或不完整（name/engine/models）");
    } else if (root.base_url !== o.baseUrlOpenAI) {
      errs.push(`base_url 未指向 LiteGate（当前 ${root.base_url}）`);
    }
    if (!process.env[KEY_ENV]) errs.push(`环境变量 ${KEY_ENV} 未设置（请在 shell profile 里 export；goose 读取顺序为 OS env → keyring/secrets.yaml）`);
    return errs;
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configPath());
  },
};
