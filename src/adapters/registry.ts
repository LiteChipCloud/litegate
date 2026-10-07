import type { ToolAdapter } from "../types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { zcodeAdapter } from "./zcode.js";
import { minimaxCodeAdapter } from "./minimax-code.js";
import { traeAdapter } from "./trae.js";
import { workbuddyAdapter } from "./workbuddy.js";

export const ADAPTERS: ToolAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  zcodeAdapter,
  minimaxCodeAdapter,
  traeAdapter,
  workbuddyAdapter,
];

export function getAdapter(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
