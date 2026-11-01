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
import { codebuddyAdapter } from "../../src/adapters/codebuddy.js";
import { workbuddyAdapter } from "../../src/adapters/workbuddy.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

/**
 * CodeBuddy / WorkBuddy 共用 tencent-models-json 写入逻辑，差异仅顶层形态：
 * CodeBuddy 全新文件写 {"models":[…]} 包装对象（官方文档），WorkBuddy 写裸数组（实机确认）。
 */
const codebuddyFile = () => path.join(tmpHome(), ".codebuddy", "models.json");
const workbuddyFile = () => path.join(tmpHome(), ".workbuddy", "models.json");

beforeEach(() => {
  for (const d of [".codebuddy", ".workbuddy", ".litegate"]) {
    fs.rmSync(path.join(tmpHome(), d), { recursive: true, force: true });
  }
});

describe("腾讯系 models.json 共同契约（CodeBuddy + WorkBuddy）", () => {
  it.each([
    ["codebuddy", codebuddyFile, true],
    ["workbuddy", workbuddyFile, false],
  ] as const)("%s：全新写入 LiteGate 全量 chat 模型条目", (_, fileOf, wrapped) => {
    const res = (wrapped ? codebuddyAdapter : workbuddyAdapter).configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const parsed = readJSON(fileOf());
    const models = wrapped ? parsed.models : parsed;
    if (wrapped) expect(Array.isArray(parsed)).toBe(false);
    else expect(Array.isArray(parsed)).toBe(true);

    expect(models).toHaveLength(sampleChatModels().length);
    const glm = models.find((x: any) => x.id === "glm-5.3-flash");
    expect(glm).toMatchObject({
      name: "LiteGate GLM-5.3-Flash",
      vendor: "LiteGate",
      apiKey: "sk-lcc-test-key-000000000000",
      url: "https://www.litechipcloud.cn/v1/chat/completions",
      supportsToolCall: true,
      supportsImages: false,
    });
  });

  it.each([
    ["codebuddy", codebuddyAdapter, codebuddyFile],
    ["workbuddy", workbuddyAdapter, workbuddyFile],
  ] as const)("%s：非 LiteGate 条目一字不动，LiteGate 条目 upsert 不重复", (_, adapter, fileOf) => {
    fs.mkdirSync(path.dirname(fileOf()), { recursive: true });
    const other = { id: "gpt-x", name: "Other", vendor: "custom", apiKey: "k", url: "https://api.other.com/v1/chat/completions" };
    fs.writeFileSync(fileOf(), JSON.stringify([other]));

    adapter.configure(makeOptions());
    adapter.configure(makeOptions()); // 重复 init 不翻倍

    const models = readJSON(fileOf());
    expect(models[0]).toEqual(other);
    expect(models).toHaveLength(1 + sampleChatModels().length);
  });

  it.each([
    ["codebuddy", codebuddyAdapter, codebuddyFile],
    ["workbuddy", workbuddyAdapter, workbuddyFile],
  ] as const)("%s：非法 JSON 拒绝修改 / dry-run 不落盘 / 已有文件备份", (_, adapter, fileOf) => {
    fs.mkdirSync(path.dirname(fileOf()), { recursive: true });
    fs.writeFileSync(fileOf(), "{broken");
    let res = adapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");

    fs.rmSync(fileOf());
    res = adapter.configure(makeOptions({ dryRun: true }));
    expect(res.wrote).toBe(false);
    expect(fs.existsSync(fileOf())).toBe(false);

    fs.writeFileSync(fileOf(), "[]");
    adapter.configure(makeOptions());
    expect(fs.readdirSync(path.dirname(fileOf())).some((f) => f.includes("bak-litegate"))).toBe(true);
  });

  it.each([
    ["codebuddy", codebuddyAdapter, codebuddyFile],
    ["workbuddy", workbuddyAdapter, workbuddyFile],
  ] as const)("%s：verify 通过与缺条目报告", (_, adapter, fileOf) => {
    expect(adapter.verify(makeOptions())[0]).toContain("不存在");

    fs.mkdirSync(path.dirname(fileOf()), { recursive: true });
    fs.writeFileSync(fileOf(), "[]");
    expect(adapter.verify(makeOptions())).toEqual(["无 LiteGate 模型条目"]);

    adapter.configure(makeOptions());
    expect(adapter.verify(makeOptions())).toEqual([]);
  });
});
