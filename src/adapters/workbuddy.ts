import type { ToolAdapter } from "../types.js";
import type { ConfigureOptions, ToolInstallInfo, AdapterResult } from "../types.js";

const ID = "workbuddy";
const NAME = "WorkBuddy";

export const workbuddyAdapter: ToolAdapter = {
  id: ID,
  name: NAME,
  detect(): ToolInstallInfo {
    return { id: ID, name: NAME, present: false, configPath: "", configExists: false, detail: "V0.2 支持（配置存储调研中）" };
  },
  configure(): AdapterResult {
    return { ok: false, supported: false, wrote: false, changes: [], skipped: "V0.2 支持，V0.1 请手动配置" };
  },
  verify(): string[] { return []; },
  restore(): void {},
};
