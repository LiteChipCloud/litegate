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
import { homedir } from "node:os";
import { gooseAdapter, configPathFor } from "../../src/adapters/goose.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const gooseFile = () => configPathFor(process.platform);
const gooseProvidersDir = () => path.dirname(gooseFile());

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".config", "goose"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), "AppData"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
  delete process.env.LITEGATE_API_KEY;
});

describe("goose configure", () => {
  it("全新写入：engine=openai 全量 chat 模型，key 绝不落盘（api_key_env 只写变量名）", () => {
    const res = gooseAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const root = readJSON(gooseFile());
    expect(root).toMatchObject({
      name: "litegate",
      engine: "openai", // goose 官方枚举三值之一（declarative.rs:101-123）
      display_name: "LiteGate",
      api_key_env: "LITEGATE_API_KEY",
      base_url: "https://www.litechipcloud.cn/v1",
      requires_auth: true,
    });
    expect(root.models).toHaveLength(sampleChatModels().length);
    expect(root.models[0]).toEqual({ name: "glm-5.3-flash", context_limit: 1_000_000 });
    expect(JSON.stringify(root)).not.toContain("sk-lcc-test-key"); // key 不落盘
    expect(res.changes.some((c) => c.includes("LITEGATE_API_KEY"))).toBe(true);
  });

  it("已有文件：保留用户自定义字段（description/headers/timeout/streaming）与模型价格字段，只更新 LiteGate 管理字段", () => {
    fs.mkdirSync(gooseProvidersDir(), { recursive: true });
    fs.writeFileSync(
      gooseFile(),
      JSON.stringify({
        name: "litegate",
        engine: "anthropic", // 用户改过 engine → 纠正回 openai
        display_name: "我的旧名字",
        description: "用户描述",
        headers: { "X-Corp": "keep" },
        timeout_seconds: 30,
        supports_streaming: false,
        base_url: "https://old.example.com/v1",
        models: [
          // 用户给同名模型加过价格/能力字段 → 合并保留，context_limit 刷新
          { name: "glm-5.3-flash", context_limit: 999, input_token_cost: 0.000001, supports_vision: true, reasoning: true },
          // 用户自加的外来模型 → 原样保留（Coexist）
          { name: "my-own-model", context_limit: 4096 },
        ],
      }),
    );

    const res = gooseAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const root = readJSON(gooseFile());
    expect(root.display_name).toBe("LiteGate");
    expect(root.engine).toBe("openai");
    expect(root.description).toBe("用户描述");
    expect(root.headers).toEqual({ "X-Corp": "keep" });
    expect(root.timeout_seconds).toBe(30);
    expect(root.supports_streaming).toBe(false);
    expect(root.base_url).toBe("https://www.litechipcloud.cn/v1");
    const merged = root.models.find((m: any) => m.name === "glm-5.3-flash");
    expect(merged).toMatchObject({ context_limit: 1_000_000, input_token_cost: 0.000001, supports_vision: true, reasoning: true });
    expect(root.models.find((m: any) => m.name === "my-own-model")).toEqual({ name: "my-own-model", context_limit: 4096 });
    expect(root.models).toHaveLength(sampleChatModels().length + 1);
  });

  it("非法 JSON 拒绝修改（坏文件会连累 goose 整个 custom_providers 目录加载）；根非对象同样拒绝", () => {
    fs.mkdirSync(gooseProvidersDir(), { recursive: true });
    fs.writeFileSync(gooseFile(), "{broken");
    const res = gooseAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");
    expect(fs.readFileSync(gooseFile(), "utf8")).toBe("{broken"); // 原文未动

    fs.writeFileSync(gooseFile(), "[1,2]");
    expect(gooseAdapter.configure(makeOptions()).error).toContain("根不是 JSON 对象");
    expect(fs.readFileSync(gooseFile(), "utf8")).toBe("[1,2]");
  });

  it("dry-run 不落盘", () => {
    expect(gooseAdapter.configure(makeOptions({ dryRun: true })).wrote).toBe(false);
    expect(fs.existsSync(gooseFile())).toBe(false);

    fs.mkdirSync(gooseProvidersDir(), { recursive: true });
    fs.writeFileSync(gooseFile(), "{}");
    gooseAdapter.configure(makeOptions({ dryRun: true }));
    expect(fs.readFileSync(gooseFile(), "utf8")).toBe("{}");
  });

  it("已有文件写入前产生备份，备份保留原文", () => {
    fs.mkdirSync(gooseProvidersDir(), { recursive: true });
    fs.writeFileSync(gooseFile(), JSON.stringify({ name: "litegate", base_url: "https://old.example.com/v1" }));

    gooseAdapter.configure(makeOptions());

    const bak = fs.readdirSync(gooseProvidersDir()).filter((f) => f.includes(".bak-litegate-"));
    expect(bak).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(gooseProvidersDir(), bak[0]), "utf8")).base_url).toBe("https://old.example.com/v1");
  });

  it("内容已一致 → 跳过写入且不产生新备份（ruler 同款幂等）", () => {
    gooseAdapter.configure(makeOptions()); // 首次写入（新文件，本就不产生备份）
    const before = fs.readFileSync(gooseFile(), "utf8");

    const res = gooseAdapter.configure(makeOptions());
    expect(res.wrote).toBe(false);
    expect(res.skipped).toContain("跳过写入");
    expect(fs.readFileSync(gooseFile(), "utf8")).toBe(before);
    expect(fs.readdirSync(gooseProvidersDir()).filter((f) => f.includes(".bak-litegate-"))).toHaveLength(0);
  });
});

describe("goose verify", () => {
  it("文件缺失 / 写入后 env 未设 / env 已设 / 语法损坏，四态齐验", () => {
    expect(gooseAdapter.verify(makeOptions())[0]).toContain("不存在");

    gooseAdapter.configure(makeOptions());
    const errs = gooseAdapter.verify(makeOptions());
    expect(errs.some((e) => e.includes("LITEGATE_API_KEY 未设置"))).toBe(true);

    process.env.LITEGATE_API_KEY = "sk-lcc-test-key-000000000000";
    expect(gooseAdapter.verify(makeOptions())).toEqual([]);

    fs.writeFileSync(gooseFile(), "{broken");
    expect(gooseAdapter.verify(makeOptions())[0]).toContain("无法解析");
    delete process.env.LITEGATE_API_KEY;
  });

  it("provider 字段被破坏 → 报缺失；base_url 被改 → 报未指向 LiteGate", () => {
    gooseAdapter.configure(makeOptions());
    const root = readJSON(gooseFile());
    delete root.engine;
    root.models = [];
    fs.writeFileSync(gooseFile(), JSON.stringify(root));
    expect(gooseAdapter.verify(makeOptions()).some((e) => e.includes("缺失或不完整"))).toBe(true);

    gooseAdapter.configure(makeOptions());
    const root2 = readJSON(gooseFile());
    root2.base_url = "https://api.other.com/v1";
    fs.writeFileSync(gooseFile(), JSON.stringify(root2));
    expect(gooseAdapter.verify(makeOptions()).some((e) => e.includes("未指向 LiteGate"))).toBe(true);
  });
});

describe("goose configPathFor 三平台（官方文档 providers.md:517-519 + etcetera 0.11）", () => {
  it("darwin/linux 走 XDG：~/.config/goose/custom_providers/litegate.json", () => {
    const expected = path.join(homedir(), ".config", "goose", "custom_providers", "litegate.json");
    expect(configPathFor("darwin")).toBe(expected);
    expect(configPathFor("linux")).toBe(expected);
    expect(configPathFor("darwin")).toContain(path.join(".config", "goose", "custom_providers"));
  });

  it("win32 走 %APPDATA%\\Block\\goose\\config（etcetera Windows 策略带 config 段）", () => {
    const p = configPathFor("win32");
    expect(p).toBe(path.join(homedir(), "AppData", "Roaming", "Block", "goose", "config", "custom_providers", "litegate.json"));
    expect(p).toContain("Block");
    expect(p).toContain(path.join("goose", "config"));
    expect(p).not.toContain(".config");
  });
});

describe("goose detect（纯文件分支——本机无 goose 命令也能走通）", () => {
  it("custom_providers 目录存在 → present；config 文件存在 → configExists", () => {
    fs.mkdirSync(gooseProvidersDir(), { recursive: true });
    const info = gooseAdapter.detect();
    expect(info.id).toBe("goose");
    expect(info.present).toBe(true);
    expect(info.configExists).toBe(false);

    fs.writeFileSync(gooseFile(), "{}");
    expect(gooseAdapter.detect().configExists).toBe(true);
  });

  it("goose 配置根目录存在 → present（装了 goose 但还没建过 provider）", () => {
    // 布局随平台（win32 = %APPDATA%\Block\goose\config）：走 configPathFor 派生，别硬编码 unix 路径
    const configDir = path.dirname(path.dirname(configPathFor(process.platform)));
    fs.mkdirSync(configDir, { recursive: true });
    expect(gooseAdapter.detect().present).toBe(true);
    expect(gooseAdapter.detect().detail).toContain("LITEGATE_API_KEY");
  });
});
