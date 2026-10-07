import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ToolInstallInfo } from "../types.js";

function home(...p: string[]): string {
  return path.join(os.homedir(), ...p);
}
function exists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}
function cmdExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { shell: "/bin/zsh", stdio: "ignore" });
    return true;
  } catch { return false; }
}

export interface ToolSpec {
  id: string;
  name: string;
  detect: () => ToolInstallInfo;
}

export const TOOLS: ToolSpec[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    detect: () => {
      const configPath = home(".claude", "settings.json");
      return { id: "claude-code", name: "Claude Code", present: exists(home(".claude")) || cmdExists("claude"), configPath, configExists: exists(configPath) };
    },
  },
  {
    id: "codex",
    name: "Codex CLI",
    detect: () => {
      const configPath = home(".codex", "config.toml");
      return { id: "codex", name: "Codex CLI", present: exists(home(".codex")) || cmdExists("codex"), configPath, configExists: exists(configPath) };
    },
  },
  {
    id: "zcode",
    name: "ZCode",
    detect: () => {
      const configPath = home(".zcode", "v2", "provider_config.json");
      return { id: "zcode", name: "ZCode", present: exists(home(".zcode")) || !!process.env.ZCODE_APP_VERSION, configPath, configExists: exists(configPath) };
    },
  },
  {
    id: "minimax-code",
    name: "MiniMax Code",
    detect: () => {
      const configPath = home(".minimax", "config.yaml");
      return { id: "minimax-code", name: "MiniMax Code", present: exists(home(".minimax")) || cmdExists("mcode"), configPath, configExists: exists(configPath) };
    },
  },
  {
    id: "trae",
    name: "Trae",
    detect: () => {
      const base = process.env.HOME?.startsWith("/Users") ? home("Library", "Application Support", "Trae") : home(".config", "Trae");
      return { id: "trae", name: "Trae", present: exists(base), configPath: base, configExists: exists(base) };
    },
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    detect: () => {
      const base = home(".workbuddy");
      return { id: "workbuddy", name: "WorkBuddy", present: exists(base), configPath: base, configExists: exists(base) };
    },
  },
];
