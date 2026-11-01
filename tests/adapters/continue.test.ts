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
import { continueAdapter } from "../../src/adapters/continue.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const configFile = () => path.join(tmpHome(), ".continue", "config.json");

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".continue"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("continue configure", () => {
  it("为每个 chat 模型写入一条 entry", () => {
    const res = continueAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    const root = readJSON(configFile());
    expect(root.models).toHaveLength(sampleChatModels().length);
    const glm = root.models.find((x: any) => x.model === "glm-5.3-flash");
    expect(glm).toMatchObject({
      title: "LiteGate GLM-5.3-Flash",
      provider: "openai",
      apiBase: "https://www.litechipcloud.cn/v1",
      apiKey: "sk-lcc-test-key-000000000000",
    });
  });

  it("已有 LiteGate 条目 → 更新而非追加", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({
      models: [{ title: "LiteGate GLM-5.3-Flash", provider: "openai", model: "glm-5.3-flash", apiBase: "https://www.litechipcloud.cn/v1", apiKey: "sk-lcc-old" }],
    }));

    const res = continueAdapter.configure(makeOptions());

    const root = readJSON(configFile());
    expect(root.models).toHaveLength(sampleChatModels().length); // 不重复
    expect(root.models.find((x: any) => x.model === "glm-5.3-flash").apiKey).toBe("sk-lcc-test-key-000000000000");
    expect(res.changes).toHaveLength(sampleChatModels().length);
  });

  it("🔒 同 model 但 apiBase 指向其他服务 → 追加新条目，原条目一字不动", () => {
    const other = { title: "Other", provider: "openai", model: "glm-5.3-flash", apiBase: "https://api.other.com/v1", apiKey: "sk-other" };
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({ models: [other] }));

    continueAdapter.configure(makeOptions());

    const root = readJSON(configFile());
    expect(root.models[0]).toEqual(other);
    expect(root.models).toHaveLength(1 + sampleChatModels().length);
  });

  it("用户 root 级其它字段保留", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({ models: [], allowAnonymousTelemetry: false }));
    continueAdapter.configure(makeOptions());
    expect(readJSON(configFile()).allowAnonymousTelemetry).toBe(false);
  });

  it("非法 JSON → 拒绝修改", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "{broken");
    const res = continueAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");
  });

  it("🔒 dry-run 不落盘", () => {
    const res = continueAdapter.configure(makeOptions({ dryRun: true }));
    expect(res.wrote).toBe(false);
    expect(fs.existsSync(configFile())).toBe(false);
  });
});

describe("continue verify / restore", () => {
  it("写入后 verify 无错误；无 LiteGate 条目 → 报告", () => {
    continueAdapter.configure(makeOptions());
    expect(continueAdapter.verify(makeOptions())).toEqual([]);

    fs.writeFileSync(configFile(), JSON.stringify({ models: [] }));
    expect(continueAdapter.verify(makeOptions())).toHaveLength(1);
  });

  it("restore 从备份还原", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), '{"models":["orig"]}');
    const bak = path.join(tmpHome(), "continue.bak");
    fs.copyFileSync(configFile(), bak);
    fs.writeFileSync(configFile(), '{"models":[]}');

    continueAdapter.restore(bak);
    expect(readJSON(configFile()).models).toEqual(["orig"]);
  });
});
