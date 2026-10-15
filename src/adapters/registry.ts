import type { ToolAdapter } from "../types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { zcodeAdapter } from "./zcode.js";
import { minimaxCodeAdapter } from "./minimax-code.js";
import { claudeDesktopAdapter } from "./claude-desktop.js";
import { traeAdapter } from "./trae.js";
import { workbuddyAdapter } from "./workbuddy.js";
import { continueAdapter } from "./continue.js";

export const ADAPTERS: ToolAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  zcodeAdapter,
  minimaxCodeAdapter,
  claudeDesktopAdapter,
  traeAdapter,
  workbuddyAdapter,
  continueAdapter,
];

export function getAdapter(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
