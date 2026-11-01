import type { ToolAdapter } from "../types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { zcodeAdapter } from "./zcode.js";
import { minimaxCodeAdapter } from "./minimax-code.js";
import { claudeDesktopAdapter } from "./claude-desktop.js";
import { traeAdapter } from "./trae.js";
import { workbuddyAdapter } from "./workbuddy.js";
import { continueAdapter } from "./continue.js";
import { codebuddyAdapter } from "./codebuddy.js";
import { crushAdapter } from "./crush.js";
import { opencodeAdapter } from "./opencode.js";
import { zedAdapter } from "./zed.js";
import { qwenCodeAdapter } from "./qwen-code.js";

export const ADAPTERS: ToolAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  zcodeAdapter,
  minimaxCodeAdapter,
  claudeDesktopAdapter,
  workbuddyAdapter,
  codebuddyAdapter,
  crushAdapter,
  opencodeAdapter,
  zedAdapter,
  qwenCodeAdapter,
  traeAdapter,
  continueAdapter,
];

export function getAdapter(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
