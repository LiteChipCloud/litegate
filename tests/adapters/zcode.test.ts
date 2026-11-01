import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

import fs from "node:fs";
import path from "node:path";
import { zcodeAdapter } from "../../src/adapters/zcode.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const configFile = () => path.join(tmpHome(), ".zcode", "v2", "provider_config.json");
const readRoot = () => readJSON(configFile());
const liteGateRule = () =>
  readRoot().config.providerConfigRules.providerRules.find((r: any) => r.providerName === "LiteGate");

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".zcode"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("zcode configure（全新安装）", () => {
  it("写入骨架 + LiteGate providerRule + 模型上下文规则", () => {
    const res = zcodeAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const root = readRoot();
    expect(root.schemaVersion).toBe(1);

    const lg = liteGateRule();
    expect(lg.providerId).toMatch(/^[0-9a-f-]{36}$/); // randomUUID
    expect(lg.config.access.apiKey).toBe("sk-lcc-test-key-000000000000");
    expect(lg.config.api).toEqual({ type: "anthropic-messages", baseUrl: "https://www.litechipcloud.cn" });

    const chatIds = sampleChatModels().map((x) => x.modelKey);
    expect(lg.config.personalModelIds).toEqual(chatIds);
    expect(lg.config.modelOrder).toEqual(chatIds);

    const ctxRules = root.config.modelConfigRules.providerModelRules;
    expect(ctxRules).toHaveLength(chatIds.length);
    const glm = ctxRules.find((r: any) => r.modelId === "glm-5.3-flash");
    expect(glm.providerId).toBe(lg.providerId);
    expect(glm.config.properties.contextWindow).toBe(1_000_000);
  });

  it("全新安装无 .bak 备份", () => {
    zcodeAdapter.configure(makeOptions());
    expect(fs.readdirSync(path.join(tmpHome(), ".zcode", "v2")).some((f) => f.includes("bak-litegate"))).toBe(false);
  });
});

describe("zcode configure（已有配置）", () => {
  const seed = (extra: (root: any) => void) => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    const root = {
      schemaVersion: 1,
      config: {
        providerConfigRules: {
          providerRules: [
            {
              providerId: "11111111-1111-1111-1111-111111111111",
              providerName: "LiteGate",
              config: {
                group: "standard-personal",
                access: { type: "api-key", apiKey: "sk-lcc-old" },
                api: { type: "anthropic-messages", baseUrl: "https://www.litechipcloud.cn" },
                personalModelIds: ["glm-5.3-flash"],
                modelOrder: ["glm-5.3-flash"],
              },
            },
            { providerId: "p-other", providerName: "官方", config: { access: { apiKey: "k" } } },
          ],
        },
        modelConfigRules: {
          providerModelRules: [
            { modelId: "glm-5.3-flash", providerId: "11111111-1111-1111-1111-111111111111", config: { properties: { contextWindow: 1 } } },
            { modelId: "claude-sonnet-5-5", providerId: "11111111-1111-1111-1111-111111111111", config: { properties: { contextWindow: 200000 } } }, // 孤儿
            { modelId: "whatever", providerId: "p-other", config: { properties: { contextWindow: 999 } } }, // 其他 provider，不动
          ],
        },
      },
    };
    extra(root);
    fs.writeFileSync(configFile(), JSON.stringify(root));
  };

  it("🔒 increment 模式保留用户已设 apiKey，刷新模型列表并清理孤儿 ctx 规则", () => {
    seed(() => {});
    const res = zcodeAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    expect(res.changes.some((c) => c.includes("清理孤儿"))).toBe(true);
    const root = readRoot();
    const lg = root.config.providerConfigRules.providerRules.find((r: any) => r.providerName === "LiteGate");
    expect(lg.config.access.apiKey).toBe("sk-lcc-old"); // 不覆盖
    expect(lg.providerId).toBe("11111111-1111-1111-1111-111111111111"); // 不新建
    expect(root.config.providerConfigRules.providerRules).toHaveLength(2); // 不重复

    const ctx = root.config.modelConfigRules.providerModelRules;
    expect(ctx.find((r: any) => r.modelId === "claude-sonnet-5-5")).toBeUndefined(); // 孤儿被清
    expect(ctx.find((r: any) => r.modelId === "whatever")).toBeDefined(); // 其他 provider 保留
    expect(ctx.find((r: any) => r.modelId === "glm-5.3-flash").config.properties.contextWindow).toBe(1_000_000); // 刷新
  });

  it("replace 模式覆盖 apiKey", () => {
    seed(() => {});
    zcodeAdapter.configure(makeOptions({ mode: "replace" }));
    expect(liteGateRule().config.access.apiKey).toBe("sk-lcc-test-key-000000000000");
  });

  it("已有配置写入前产生备份", () => {
    seed(() => {});
    zcodeAdapter.configure(makeOptions());
    expect(fs.readdirSync(path.dirname(configFile())).some((f) => f.includes("bak-litegate"))).toBe(true);
  });
});

describe("zcode configure（防御）", () => {
  it("非法 JSON → 拒绝修改", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "{broken");
    const res = zcodeAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");
    expect(fs.readFileSync(configFile(), "utf8")).toBe("{broken");
  });

  it("🔒 dry-run 不落盘", () => {
    const res = zcodeAdapter.configure(makeOptions({ dryRun: true }));
    expect(res.wrote).toBe(false);
    expect(res.changes.length).toBeGreaterThan(0);
    expect(fs.existsSync(configFile())).toBe(false);
  });
});

describe("zcode verify", () => {
  it("写入后 verify 无错误", () => {
    zcodeAdapter.configure(makeOptions());
    expect(zcodeAdapter.verify(makeOptions())).toEqual([]);
  });

  it("缺 LiteGate rule / 缺 apiKey → 报告", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({ schemaVersion: 1, config: { providerConfigRules: { providerRules: [] }, modelConfigRules: { providerModelRules: [] } } }));
    const errs = zcodeAdapter.verify(makeOptions());
    expect(errs.some((e) => e.includes("providerRule 不存在"))).toBe(true);
  });
});
