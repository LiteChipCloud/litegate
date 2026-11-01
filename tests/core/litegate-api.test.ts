import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  fetchModelPricing,
  chatModels,
  pickDefaultModel,
  sortByPrice,
  isFree,
  priceLabel,
  verifyKey,
} from "../../src/core/litegate-api.js";
import { sampleModels, sampleChatModels } from "../helpers/fixtures.js";
import type { LiteGateModel } from "../../src/types.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());
afterEach(() => vi.restoreAllMocks());

const okBody = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("fetchModelPricing", () => {
  it("code=0 且 data 为数组 → 返回模型数组", async () => {
    fetchMock.mockResolvedValue(okBody({ code: 0, data: sampleModels() }));
    const models = await fetchModelPricing();
    expect(models).toHaveLength(10);
    expect(fetchMock.mock.calls[0][0]).toContain("litechipcloud.cn/admin-api/ai/litegate/model/pricing");
  });

  it("HTTP 非 200 → 抛错且带状态码", async () => {
    fetchMock.mockResolvedValue(okBody({}, 502));
    await expect(fetchModelPricing()).rejects.toThrow("HTTP 502");
  });

  it("code!=0 → 抛「返回异常」", async () => {
    fetchMock.mockResolvedValue(okBody({ code: 401 }));
    await expect(fetchModelPricing()).rejects.toThrow("返回异常");
  });

  it("data 非数组 → 抛「返回异常」", async () => {
    fetchMock.mockResolvedValue(okBody({ code: 0, data: { x: 1 } }));
    await expect(fetchModelPricing()).rejects.toThrow("返回异常");
  });

  it("网络异常 → 透传", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(fetchModelPricing()).rejects.toThrow("ECONNREFUSED");
  });
});

describe("chatModels", () => {
  it("只留 chat 类型", () => {
    expect(chatModels(sampleModels())).toEqual(sampleChatModels());
  });
});

describe("pickDefaultModel（默认模型偏好序）", () => {
  it("偏好序首位在售 → 直接命中 glm-5.3-flash", () => {
    expect(pickDefaultModel(sampleChatModels())).toBe("glm-5.3-flash");
  });

  it("首位下架 → 顺位 minimax-m3.1-flash", () => {
    const withoutFlash = sampleChatModels().filter((m) => m.modelKey !== "glm-5.3-flash");
    expect(pickDefaultModel(withoutFlash)).toBe("minimax-m3.1-flash");
  });

  it("偏好序全下架 → 兜底取目录第一条", () => {
    const others: LiteGateModel[] = [{ ...sampleChatModels()[0], modelKey: "some-new-model" }];
    expect(pickDefaultModel(others)).toBe("some-new-model");
  });

  it("空目录 → 最终兜底 minimax-m3.1-flash", () => {
    expect(pickDefaultModel([])).toBe("minimax-m3.1-flash");
  });
});

describe("sortByPrice", () => {
  it("免费 → 付费 chat 升序 → 非 chat；且不改动输入数组", () => {
    const input = sampleModels();
    const snapshot = [...input];
    const sorted = sortByPrice(input);

    expect(input).toEqual(snapshot); // 纯函数：不 mutate
    const freeCount = sorted.findIndex((m) => !isFree(m));
    expect(sorted.slice(0, freeCount).every(isFree)).toBe(true);
    const paid = sorted.slice(freeCount);
    expect(paid.filter((m) => m.type === "chat").map((m) => m.inputPrice + m.outputPrice))
      .toEqual([...paid.filter((m) => m.type === "chat").map((m) => m.inputPrice + m.outputPrice)].sort((a, b) => a - b));
    expect(paid.at(-1)!.type).not.toBe("chat");
  });
});

describe("isFree", () => {
  it("token 模型看双价；per_call 模型看次价", () => {
    expect(isFree(sampleModels().find((m) => m.modelKey === "agnes-3.0")!)).toBe(true);
    expect(isFree(sampleModels().find((m) => m.modelKey === "agnes-image-2.5")!)).toBe(true); // per_call 0 元
    expect(isFree(sampleModels().find((m) => m.modelKey === "wemm-embedding-2b")!)).toBe(false); // per_call 0.2085
    expect(isFree(sampleModels().find((m) => m.modelKey === "glm-5.3-flash")!)).toBe(false);
  });
});

describe("priceLabel（0.7.x 价格单位修复回归锁）", () => {
  it("token 模型：元/千 → 元/百万（×1000）", () => {
    expect(priceLabel(sampleModels().find((m) => m.modelKey === "glm-5.3-flash")!)).toBe("¥0.38 / ¥1.33 每百万");
  });

  it("per_call 模型：保持元/次，不做千倍换算", () => {
    expect(priceLabel(sampleModels().find((m) => m.modelKey === "wemm-embedding-2b")!)).toBe("¥0.2085 / 次");
  });
});

describe("verifyKey", () => {
  it("空 key → 直接失败，不发请求", async () => {
    const r = await verifyKey("");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 → Key 无效", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    expect(await verifyKey("sk-lcc-bad")).toMatchObject({ ok: false, detail: "Key 无效（401）" });
  });

  it("200 → 有效并带模型数", async () => {
    fetchMock.mockResolvedValue(okBody({ data: [{ id: "a" }, { id: "b" }] }));
    expect(await verifyKey("sk-lcc-good")).toEqual({ ok: true, detail: "有效，2 个模型可用", modelCount: 2 });
  });

  it("其他非 200 → HTTP 状态", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    expect(await verifyKey("sk-lcc-x")).toMatchObject({ ok: false, detail: "HTTP 503" });
  });

  it("网络异常 → 网络错误", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const r = await verifyKey("sk-lcc-x");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("网络错误");
  });
});
