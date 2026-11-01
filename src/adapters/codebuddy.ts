import { homedir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { ToolAdapter } from "../types.js";
import type { AdapterResult, ConfigureOptions, ToolInstallInfo } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";
import { upsertCustomModelsEntry } from "./tencent-models-json.js";

const ID = "codebuddy";
const NAME = "CodeBuddy";

/**
 * 腾讯 CodeBuddy 自定义模型配置：~/.codebuddy/models.json
 * 与 WorkBuddy 同构（docs/tool-config-storage.md），官方文档为 {"models":[…]} 包装对象，
 * 保存后 ~1s 热加载。读取兼容裸数组/包装对象两种形态，写入保持文件原有形态。
 */
function configFile(): string {
  return path.join(homedir(), ".codebuddy", "models.json");
}

export const codebuddyAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  strategy: "coexist",
  detect(): ToolInstallInfo {
    const p = configFile();
    const dir = path.dirname(p);
    return { id: ID, name: NAME, present: fs.existsSync(dir), configPath: p, configExists: fs.existsSync(p) };
  },
  configure(o: ConfigureOptions): AdapterResult {
    return upsertCustomModelsEntry({
      file: configFile(),
      tool: ID,
      wrapDefault: true, // 全新文件按官方文档写 {"models":[…]}
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
