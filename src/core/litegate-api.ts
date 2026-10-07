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

export function isFree(m: LiteGateModel): boolean {
  if (m.billingMode === "per_call")
    return (m.pricePerCall ?? 0) === 0;
  return m.inputPrice === 0 && m.outputPrice === 0;
}

export function priceLabel(m: LiteGateModel): string {
  if (m.billingMode === "per_call")
    return `¥${trim0(m.pricePerCall ?? 0)} / 次`;
  return `¥${trim0(m.inputPrice)} / ¥${trim0(m.outputPrice)} 每百万`;
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
