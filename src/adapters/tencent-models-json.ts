import fs from "node:fs";
import path from "node:path";
import type { AdapterResult, ConfigureOptions } from "../types.js";
import { assertValidJSON } from "../core/validate.js";
import { backupFile } from "../core/backup.js";

/**
 * 腾讯系工具（CodeBuddy / WorkBuddy）自定义模型配置的共同写入逻辑。
 * 两者 schema 同构（docs/tool-config-storage.md）：条目 {id,name,vendor,apiKey,url,supportsToolCall,supportsImages}，
 * 差异仅在顶层形态——CodeBuddy 官方文档为 {"models":[…]} 包装对象，WorkBuddy 实机回写为裸数组。
 */

export interface UpsertCustomModelsOptions {
  file: string;
  tool: string;
  /** 全新（不存在）文件的顶层形态：true=包装对象 {"models":[…]}，false=裸数组 */
  wrapDefault: boolean;
  /** 完整 chat completions 地址（腾讯系工具要求完整 URL，非 baseURL） */
  url: string;
  options: ConfigureOptions;
}

export function upsertCustomModelsEntry(o: UpsertCustomModelsOptions): AdapterResult {
  const { file, tool, wrapDefault, url, options: cfg } = o;

  let data: unknown = wrapDefault ? { models: [] } : [];
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return { ok: false, supported: true, wrote: false, changes: [], error: `${file} 不是合法 JSON，拒绝修改` };
    }
  }
  // 归一化出条目数组与「写回函数」（保持文件原有形态）
  const isArray = Array.isArray(data);
  const models: any[] = isArray ? data : ((data as any)?.models ?? []);
  const writeBack = (entries: any[]) => (isArray ? entries : { ...(data as object), models: entries });

  // upsert：url 指向 LiteGate 的同名条目更新，否则追加；非 LiteGate 条目一字不动
  const isLiteGate = (x: any) => (x?.url ?? "").includes("litechipcloud.cn");
  const entries = models.filter((x) => !isLiteGate(x));
  const changes = [`${path.basename(path.dirname(file))}/models.json`];
  for (const m of cfg.chatModels) {
    entries.push({
      id: m.modelKey,
      name: `LiteGate ${m.modelName}`,
      vendor: "LiteGate",
      apiKey: cfg.apiKey,
      url,
      supportsToolCall: true,
      supportsImages: false,
    });
  }
  changes.push(`模型×${cfg.chatModels.length}`);

  const out = JSON.stringify(writeBack(entries), null, 2) + "\n";
  assertValidJSON(out, `${tool} models.json`);
  if (cfg.dryRun) return { ok: true, supported: true, wrote: false, changes };
  if (!fs.existsSync(file)) fs.mkdirSync(path.dirname(file), { recursive: true });
  else backupFile(tool, file, "upsert-models");
  fs.writeFileSync(file, out);
  return { ok: true, supported: true, wrote: true, changes };
}
