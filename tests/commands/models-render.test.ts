import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// runModels 走 fetchModelPricing → mock 全局 fetch，不给真实网络发包
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { runModels } from "../../src/commands/models.js";
import { sampleModels } from "../helpers/fixtures.js";

function okBody(data: unknown) {
  return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
}

let logs: string[];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => logs.push(args.join(" ")));
  // 输入乱序，验证排序真实发生
  fetchMock.mockResolvedValue(okBody([...sampleModels()].reverse()));
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** 提取模型数据行（" 1. 名称 key 价格 …"） */
const modelRows = () => logs.filter((l) => /^\s*\d+\.\s/.test(l));

/** 行内 modelKey：模型名含空格（如 "Agnes 3.0"），不能按空白分列，直接用已知 key 匹配 */
const rowKey = (l: string): string => {
  const hit = sampleModels().find((m) => l.includes(m.modelKey));
  expect(hit, `行内未找到已知 modelKey：${l}`).toBeTruthy();
  return hit!.modelKey;
};

describe("litegate models 默认排序（价格）", () => {
  it("免费模型排最前，其后 chat 按单价升序，非 chat 类型殿后", async () => {
    await runModels("price");

    const keys = modelRows().map(rowKey);
    // 免费 3 个：两个 Agnes chat（同为 0 元，tie 由稳定排序保持输入序）+ 免费 image
    expect(keys.slice(0, 3)).toEqual(["agnes-2.5-flash", "agnes-3.0", "agnes-image-2.5"]);
    // 付费 chat 按输入+输出升序：flash(0.00038) < deepseek-flash(0.001) < m3.1(0.002) < m3(0.0021) < v4pro(0.005) < glm-5.3(0.0072)
    expect(keys.slice(3, 9)).toEqual([
      "glm-5.3-flash",
      "deepseek-flash",
      "minimax-m3.1-flash",
      "minimax-m3",
      "deepseek-v4-pro",
      "glm-5.3",
    ]);
    // 非 chat 在最后
    expect(keys.at(-1)).toBe("wemm-embedding-2b");
  });

  it("价格标签：token 单位换算为元/百万，per_call 保持元/次", async () => {
    await runModels("price");
    const all = logs.join("\n");
    expect(all).toContain("¥0.38 / ¥1.33 每百万"); // 0.00038*1000
    expect(all).toContain("¥0.2085 / 次"); // per_call 不做千倍换算
  });

  it("免费标注与类型标注", async () => {
    await runModels("price");
    const all = logs.join("\n");
    expect(all).toContain("[免费]");
    expect(all).toContain("[image]");
    expect(all).toContain("[embedding]");
  });

  it("统计行：总数与免费数", async () => {
    await runModels("price");
    expect(logs.join("\n")).toContain("共 10 个（免费 3 个）");
  });
});

describe("litegate models 按名称排序", () => {
  it("modelKey 字母序（localeCompare）", async () => {
    await runModels("name");
    const keys = modelRows().map(rowKey);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });
});

describe("CJK 列对齐", () => {
  /** 与 src/commands/models.ts 同口径：CJK 全角记 2 列 */
  function displayWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
      w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
    }
    return w;
  }

  it("中文名与英文名 pad 后，modelKey 的视觉列起始位置一致", async () => {
    await runModels("price");
    const rows = modelRows();
    expect(rows.length).toBe(10);
    // 对齐指的是终端视觉列：modelKey 之前的前缀显示宽度必须恒定
    // （JS 字符 index 因 CJK 占 2 列而不同，不能按 indexOf 断言）
    const prefixWidths = new Set(rows.map((l) => displayWidth(l.slice(0, l.indexOf(rowKey(l))))));
    expect([...prefixWidths]).toHaveLength(1);
  });
});
