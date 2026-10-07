import type { LiteGateModel } from "../types.js";

const PRICING_URL =
  "https://www.litechipcloud.cn/admin-api/ai/litegate/model/pricing";

export async function fetchModelPricing(): Promise<LiteGateModel[]> {
  const res = await fetch(PRICING_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`LiteGate 定价接口 HTTP ${res.status}`);
  const body = (await res.json()) as { code: number; data?: unknown };
  if (body.code !== 0 || !Array.isArray(body.data))
    throw new Error("LiteGate 定价接口返回异常");
  return body.data as LiteGateModel[];
}

export function chatModels(models: LiteGateModel[]): LiteGateModel[] {
  return models.filter((m) => m.type === "chat");
}

/** 默认模型偏好序（质量优先），取第一个在售的；禁止盲取接口第一条 */
const DEFAULT_MODEL_PREFERENCE = ["claude-sonnet-5-5", "glm-5.3-flash", "minimax-m3.1-flash"];

export function pickDefaultModel(chat: LiteGateModel[]): string {
  for (const key of DEFAULT_MODEL_PREFERENCE) {
    if (chat.some((m) => m.modelKey === key)) return key;
  }
  return chat[0]?.modelKey ?? "minimax-m3.1-flash";
}

/** 实时价格排序：免费 → chat（单价升序）→ image / embedding */
export function sortByPrice(models: LiteGateModel[]): LiteGateModel[] {
  const typeOrder = (t: string) => (t === "chat" ? 0 : 1);
  const cost = (m: LiteGateModel): number =>
    m.billingMode === "per_call" ? (m.pricePerCall ?? 0) : m.inputPrice + m.outputPrice;
  return [...models].sort((a, b) => {
    if (isFree(a) !== isFree(b)) return isFree(a) ? -1 : 1;
    if (typeOrder(a.type) !== typeOrder(b.type)) return typeOrder(a.type) - typeOrder(b.type);
    return cost(a) - cost(b);
  });
}

export function isFree(m: LiteGateModel): boolean {
  if (m.billingMode === "per_call")
    return (m.pricePerCall ?? 0) === 0;
  return m.inputPrice === 0 && m.outputPrice === 0;
}

export function priceLabel(m: LiteGateModel): string {
  if (m.billingMode === "per_call")
    return `¥${trimPerCall(m.pricePerCall ?? 0)} / 次`;
  return `¥${trim0(m.inputPrice)} / ¥${trim0(m.outputPrice)} 每百万`;
}

function trimPerCall(n: number): string {
  // pricePerCall 单位即元/次：0.5 -> "0.5"，不做千倍换算
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

function trim0(n: number): string {
  // 0.002 -> "2"，0.008 -> "8"，0.21 -> "0.21"（元每百万展示）
  const perM = n * 1000;
  return Number.isInteger(perM) ? String(perM) : String(Number(perM.toFixed(3)));
}

export async function verifyKey(
  key: string,
): Promise<{ ok: boolean; detail: string; modelCount?: number }> {
  if (!key) return { ok: false, detail: "Key 为空" };
  try {
    const res = await fetch("https://www.litechipcloud.cn/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) return { ok: false, detail: "Key 无效（401）" };
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const d = (await res.json()) as { data?: unknown[] };
    return { ok: true, detail: `有效，${d.data?.length ?? 0} 个模型可用`, modelCount: d.data?.length };
  } catch (e) {
    return { ok: false, detail: `网络错误：${(e as Error).message}` };
  }
}
