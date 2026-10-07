/** LiteGate 模型（来自 /admin-api/ai/litegate/model/pricing 公开接口） */
export interface LiteGateModel {
  modelKey: string;
  modelName: string;
  platform: string;
  type: string; // chat | embedding | image ...
  billingMode: string; // token | per_call
  inputPrice: number; // 元 / 千 token（per_call 模型无意义）
  outputPrice: number;
  contextWindow: number;
  pricePerCall: number | null;
}

export type VoiceState = "listening" | "thinking" | "speaking" | "idle";

export interface ConfigureOptions {
  apiKey: string;
  /** Claude 原生协议 base（不带 /v1） */
  baseUrlAnthropic: string;
  /** OpenAI 兼容协议 base（带 /v1） */
  baseUrlOpenAI: string;
  models: LiteGateModel[];
  /** 参与编程对话的 chat 模型（排除 embedding/image） */
  chatModels: LiteGateModel[];
  defaultModelKey: string;
  mode: "increment" | "replace";
  dryRun: boolean;
}

export interface ChangeRecord {
  file: string;
  action: string;
  detail?: string;
}

export interface AdapterResult {
  ok: boolean;
  supported: boolean;
  wrote: boolean; // dryRun 时为 false
  changes: string[];
  skipped?: string;
  error?: string;
}

export interface ToolInstallInfo {
  id: string;
  name: string;
  present: boolean;
  configPath: string;
  configExists: boolean;
  litegateProviderExists?: boolean;
  detail?: string;
}

export interface ChangeRecord { file: string; action: string; detail?: string }

export interface ToolAdapter {
  id: string;
  name: string;
  detect(): ToolInstallInfo;
  configure(o: ConfigureOptions, info: ToolInstallInfo): Promise<AdapterResult> | AdapterResult;
  verify(o: ConfigureOptions, info: ToolInstallInfo): Promise<string[]> | string[];
  restore(backup: string): void;
}

export interface ToolInstallInfoWithDetail extends ToolInstallInfo { detail?: string }

