import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { upsertCustomModelsEntry } from "./tencent-models-json.js";

const ID = "workbuddy";
const NAME = "WorkBuddy";

/**
 * 腾讯 WorkBuddy（CodeBuddy 内核）自定义模型配置：~/.workbuddy/models.json
 * 官方明文 JSON，保存后 ~1s 热重载。2026-11-02 实机确认：顶层为裸数组（[]），
 * 条目 schema 与 CodeBuddy 同构（docs/tool-config-storage.md）。
 */
function configFile(): string {
  return path.join(homedir(), ".workbuddy", "models.json");
}

function appInstalled(): boolean {
  try {
    return fs.existsSync("/Applications/WorkBuddy.app");
  } catch { return false; }
}

export const workbuddyAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const p = configFile();
    const dirExists = fs.existsSync(path.dirname(p));
    return {
      id: ID,
      name: NAME,
      present: appInstalled() || dirExists,
      configPath: p,
      configExists: fs.existsSync(p),
    };
  },
  configure(o: ConfigureOptions): AdapterResult {
    // 实机回写为裸数组（wrapDefault=false）；无数据目录时先建目录（app 未装也保留配置，与其行为一致）
    return upsertCustomModelsEntry({
      file: configFile(),
      tool: ID,
      wrapDefault: false,
      url: o.baseUrlOpenAI + "/chat/completions",
      options: o,
    });
  },
  verify(): string[] {
    const p = configFile();
    if (!fs.existsSync(p)) return [`${p} 不存在`];
    try {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      const models = Array.isArray(parsed) ? parsed : (parsed?.models ?? []);
      const lg = models.filter((x: any) => (x.url ?? "").includes("litechipcloud.cn"));
      if (lg.length === 0) return ["无 LiteGate 模型条目"];
      return [];
    } catch (e) { return [String(e)]; }
  },
  restore(backup: string): void {
    fs.copyFileSync(backup, configFile());
  },
};
