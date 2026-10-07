import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";

const ID = "workbuddy";
const NAME = "WorkBuddy";

/** 官方自定义模型配置：明文 JSON，保存后约 1s 热重载 */
function configFile(): string {
  return path.join(process.env.HOME ?? "", ".workbuddy", "models.json");
}

function appInstalled(): boolean {
  try {
    return fs.existsSync("/Applications/WorkBuddy.app");
  } catch { return false; }
}

export const workbuddyAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    const p = configFile();
    const dirExists = fs.existsSync(path.dirname(p));
    return {
      id: ID,
      name: NAME,
      present: appInstalled() || dirExists,
      configPath: p,
      configExists: fs.existsSync(p),
      detail: appInstalled() ? undefined : "应用未安装，检测到 ~/.workbuddy 数据目录；配置为官方明文 JSON，写入格式待 PoC（数组/包装对象双形态，docs/tool-config-storage.md）",
    };
  },
  configure(_o: ConfigureOptions): AdapterResult {
    return { ok: false, supported: false, wrote: false, changes: [], skipped: "V0.2 支持：schema 双形态待实测，请先在 WorkBuddy 模型选择器「配置自定义模型」UI 手动添加" };
  },
  verify(): string[] { return ["程序化写入待 PoC（V0.2）"]; },
  restore(): void {},
};
