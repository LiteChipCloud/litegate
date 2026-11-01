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
import yaml from "js-yaml";
import { minimaxCodeAdapter } from "../../src/adapters/minimax-code.js";
import { makeOptions, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const configFile = () => path.join(tmpHome(), ".minimax", "config.yaml");
const readRoot = () => yaml.load(fs.readFileSync(configFile(), "utf8")) as any;

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".minimax"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("minimax-code configure", () => {
  it("写入 provider.litegate（anthropic SDK、模型表、顺序与白名单）", () => {
    const res = minimaxCodeAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const root = readRoot();
    const lg = root.provider.litegate;
    expect(lg.name).toBe("LiteGate");
    expect(lg.npm).toBe("@ai-sdk/anthropic");
    expect(lg.options.apiKey).toBe("sk-lcc-test-key-000000000000");
    expect(lg.options.baseURL).toBe("https://www.litechipcloud.cn");

    const chat = sampleChatModels();
    expect(Object.keys(lg.models)).toEqual(chat.map((x) => x.modelKey));
    expect(lg.models["glm-5.3-flash"].limit.context).toBe(1_000_000);
    expect(lg.model_order).toEqual(chat.map((x) => x.modelKey));
    expect(lg.whitelist).toEqual(chat.map((x) => x.modelKey));
    // 默认骨架字段在
    expect(root.logLevel).toBe("info");
  });

  it("用户已有 YAML 字段与其它 provider 保留", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), yaml.dump({ logLevel: "debug", provider: { openai: { name: "OpenAI" } }, custom: "keep" }));

    minimaxCodeAdapter.configure(makeOptions());

    const root = readRoot();
    expect(root.logLevel).toBe("debug");
    expect(root.custom).toBe("keep");
    expect(root.provider.openai.name).toBe("OpenAI");
    expect(root.provider.litegate).toBeDefined();
  });

  it("非法 YAML → 拒绝修改", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "a: [broken");
    const res = minimaxCodeAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 YAML");
  });

  it("🔒 dry-run 不落盘", () => {
    const res = minimaxCodeAdapter.configure(makeOptions({ dryRun: true }));
    expect(res.wrote).toBe(false);
    expect(fs.existsSync(configFile())).toBe(false);
  });

  it("已有文件写入前产生备份", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "logLevel: info\n");
    minimaxCodeAdapter.configure(makeOptions());
    expect(fs.readdirSync(path.dirname(configFile())).some((f) => f.includes("bak-litegate"))).toBe(true);
  });
});

describe("minimax-code verify", () => {
  it("写入后 verify 无错误", () => {
    minimaxCodeAdapter.configure(makeOptions());
    expect(minimaxCodeAdapter.verify(makeOptions())).toEqual([]);
  });

  it("缺 provider.litegate → 报告", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "logLevel: info\n");
    expect(minimaxCodeAdapter.verify(makeOptions())).toHaveLength(1);
  });
});
