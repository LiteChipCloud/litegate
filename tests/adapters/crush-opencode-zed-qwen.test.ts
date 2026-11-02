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
import { crushAdapter } from "../../src/adapters/crush.js";
import { opencodeAdapter } from "../../src/adapters/opencode.js";
import { zedAdapter } from "../../src/adapters/zed.js";
import { qwenCodeAdapter } from "../../src/adapters/qwen-code.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const crushFile = () => path.join(tmpHome(), ".config", "crush", "crush.json");
const opencodeFile = () => path.join(tmpHome(), ".config", "opencode", "opencode.json");
const zedFile = () => path.join(tmpHome(), ".config", "zed", "settings.json");
const qwenFile = () => path.join(tmpHome(), ".qwen", "settings.json");

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".config"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".qwen"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
  delete process.env.LITEGATE_API_KEY;
});

describe("crush", () => {
  it("写 providers.litegate（openai-compat，模型自动发现），用户既有 providers 保留", () => {
    fs.mkdirSync(path.dirname(crushFile()), { recursive: true });
    fs.writeFileSync(crushFile(), JSON.stringify({ providers: { ollama: { type: "ollama" } }, permissions: { allowed_tools: ["view"] } }));

    const res = crushAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const root = readJSON(crushFile());
    expect(root.providers.ollama).toEqual({ type: "ollama" });
    expect(root.permissions).toEqual({ allowed_tools: ["view"] });
    const lg = root.providers.litegate;
    expect(lg).toMatchObject({
      name: "LiteGate",
      type: "openai-compat",
      base_url: "https://www.litechipcloud.cn/v1",
      api_key: "sk-lcc-test-key-000000000000",
    });
    expect(lg.models).toBeUndefined(); // 留空 → crush 自动 /v1/models 发现
  });

  it("非法 JSON 拒绝 / dry-run 不落盘 / 幂等不重复", () => {
    let res = crushAdapter.configure(makeOptions({ dryRun: true }));
    expect(res.wrote).toBe(false);
    expect(fs.existsSync(crushFile())).toBe(false);

    fs.mkdirSync(path.dirname(crushFile()), { recursive: true });
    fs.writeFileSync(crushFile(), "{broken");
    expect(crushAdapter.configure(makeOptions()).error).toContain("不是合法 JSON");
    fs.writeFileSync(crushFile(), "{}"); // 恢复合法内容再继续

    crushAdapter.configure(makeOptions());
    crushAdapter.configure(makeOptions());
    const root = readJSON(crushFile());
    expect(Object.keys(root.providers).filter((k) => k === "litegate")).toHaveLength(1);
  });

  it("verify：写入后无错误，缺 provider 报告", () => {
    expect(crushAdapter.verify(makeOptions())[0]).toContain("不存在");
    crushAdapter.configure(makeOptions());
    expect(crushAdapter.verify(makeOptions())).toEqual([]);
    fs.writeFileSync(crushFile(), JSON.stringify({ providers: {} }));
    expect(crushAdapter.verify(makeOptions())).toEqual(["providers.litegate 缺失"]);
  });
});

describe("opencode", () => {
  it("写 provider.litegate（openai-compatible + 全量 chat 模型 limit.context）", () => {
    const res = opencodeAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const lg = readJSON(opencodeFile()).provider.litegate;
    expect(lg).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      name: "LiteGate",
      options: { baseURL: "https://www.litechipcloud.cn/v1", apiKey: "sk-lcc-test-key-000000000000" },
    });
    expect(Object.keys(lg.models)).toHaveLength(sampleChatModels().length);
    expect(lg.models["glm-5.3-flash"].limit.context).toBe(1_000_000);
  });

  it(".jsonc（带注释）→ 拒绝改写保住注释，错误信息明确指引", () => {
    fs.mkdirSync(path.dirname(opencodeFile()), { recursive: true });
    fs.writeFileSync(path.join(tmpHome(), ".config", "opencode", "opencode.jsonc"), '{ // 注释\n"theme": "dark"\n}');
    const res = opencodeAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("为保住您的注释未自动改写");
    expect(res.error).toContain('provider "litegate"');
    expect(fs.readFileSync(path.join(tmpHome(), ".config", "opencode", "opencode.jsonc"), "utf8")).toContain("注释");
  });

  it("带注释文件 verify 可正确读取（注释/尾逗号不再误报，坏 JSON 仍报无法解析）", () => {
    fs.mkdirSync(path.dirname(opencodeFile()), { recursive: true });

    // 注释文件但缺 litegate → 报「缺失」而不是解析失败
    fs.writeFileSync(opencodeFile(), '{ // 注释\n"theme": "dark"\n}');
    expect(opencodeAdapter.verify(makeOptions())).toEqual(["provider.litegate 缺失"]);

    // 注释 + 尾逗号但 litegate 齐全 → 校验通过
    fs.writeFileSync(
      opencodeFile(),
      [
        "// LiteGate 手动接入",
        "{",
        '  "provider": {',
        '    "litegate": {',
        '      "npm": "@ai-sdk/openai-compatible",',
        '      "name": "LiteGate",',
        '      "options": { "baseURL": "https://www.litechipcloud.cn/v1", "apiKey": "sk-manual" },',
        "    },",
        "  },",
        '  "theme": "dark", // 尾注释',
        "}",
      ].join("\n"),
    );
    expect(opencodeAdapter.verify(makeOptions())).toEqual([]);

    // 真·语法损坏 → 仍报无法解析
    fs.writeFileSync(opencodeFile(), "{broken");
    expect(opencodeAdapter.verify(makeOptions())[0]).toContain("无法解析");
  });

  it("补官方 $schema（ruler 同款）：缺则加、用户已自定义则保留", () => {
    opencodeAdapter.configure(makeOptions());
    expect(readJSON(opencodeFile()).$schema).toBe("https://opencode.ai/config.json");

    fs.mkdirSync(path.dirname(opencodeFile()), { recursive: true });
    fs.writeFileSync(opencodeFile(), JSON.stringify({ $schema: "https://example.com/custom.json" }));
    opencodeAdapter.configure(makeOptions());
    expect(readJSON(opencodeFile()).$schema).toBe("https://example.com/custom.json");
    expect(readJSON(opencodeFile()).provider.litegate).toBeDefined();
  });
});

describe("zed", () => {
  it("写 openai_compatible.litegate；🔴 API key 绝不写入 settings.json（官方禁令）", () => {
    const res = zedAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    expect(res.changes.some((c) => c.includes("LITEGATE_API_KEY"))).toBe(true);
    const lg = readJSON(zedFile()).language_models.openai_compatible.litegate;
    expect(lg.api_url).toBe("https://www.litechipcloud.cn/v1");
    expect(lg.available_models).toHaveLength(sampleChatModels().length);
    expect(lg.available_models[0]).toEqual({ name: "glm-5.3-flash", display_name: "GLM-5.3-Flash", max_tokens: 1_000_000 });
    expect(JSON.stringify(readJSON(zedFile()))).not.toContain("sk-lcc-test-key"); // key 不落盘
  });

  it("JSONC（Zed 允许注释）→ 拒绝改写保住注释，错误信息明确；verify 检查 LITEGATE_API_KEY", () => {
    fs.mkdirSync(path.dirname(zedFile()), { recursive: true });
    fs.writeFileSync(zedFile(), '{ // 用户注释\n"theme": "one"\n}');
    const res = zedAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("为保住您的注释未自动改写");
    expect(res.error).toContain('provider "litegate"');
    expect(fs.readFileSync(zedFile(), "utf8")).toContain("用户注释"); // 原文件未被改写

    fs.writeFileSync(zedFile(), "{}");
    const errs = zedAdapter.verify(makeOptions());
    expect(errs.some((e) => e.includes("LITEGATE_API_KEY 未设置"))).toBe(true);

    process.env.LITEGATE_API_KEY = "sk-lcc-test-key-000000000000";
    zedAdapter.configure(makeOptions());
    expect(zedAdapter.verify(makeOptions())).toEqual([]);
    delete process.env.LITEGATE_API_KEY;
  });

  it("带注释文件 verify 可正确读取（注释/尾逗号不再误报，坏 JSON 仍报无法解析）", () => {
    fs.mkdirSync(path.dirname(zedFile()), { recursive: true });

    // 注释文件但缺 litegate → 报「缺失」而不是解析失败
    fs.writeFileSync(zedFile(), '{ // 用户注释\n"theme": "one"\n}');
    const errs = zedAdapter.verify(makeOptions());
    expect(errs).toContain("openai_compatible.litegate 缺失");
    expect(errs.some((e) => e.includes("LITEGATE_API_KEY 未设置"))).toBe(true);

    // 注释 + 尾逗号但 litegate 齐全 → 校验通过
    process.env.LITEGATE_API_KEY = "sk-lcc-test-key-000000000000";
    fs.writeFileSync(
      zedFile(),
      [
        "// LiteGate 手动接入（Zed 支持 JSONC 注释）",
        "{",
        '  "language_models": {',
        '    "openai_compatible": {',
        '      "litegate": {',
        '        "api_url": "https://www.litechipcloud.cn/v1",',
        '        "available_models": [{ "name": "glm-5.3-flash", "display_name": "GLM-5.3-Flash", "max_tokens": 1000000 }],',
        "      },",
        "    },",
        "  },",
        '  "theme": "one", // 尾注释',
        "}",
      ].join("\n"),
    );
    expect(zedAdapter.verify(makeOptions())).toEqual([]);
    delete process.env.LITEGATE_API_KEY;

    // 真·语法损坏 → 仍报无法解析
    fs.writeFileSync(zedFile(), "{broken");
    expect(zedAdapter.verify(makeOptions())[0]).toContain("无法解析");
  });
});

describe("qwen-code", () => {
  it("settings.json env 段写 OpenAI 三件套，用户既有字段保留", () => {
    fs.mkdirSync(path.dirname(qwenFile()), { recursive: true });
    fs.writeFileSync(qwenFile(), JSON.stringify({ modelProviders: { openai: { apiKeyEnv: "OPENAI_API_KEY" } }, env: { MY_VAR: "keep" } }));

    const res = qwenCodeAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const root = readJSON(qwenFile());
    expect(root.modelProviders).toBeDefined(); // 用户段保留
    expect(root.env.MY_VAR).toBe("keep");
    expect(root.env).toMatchObject({
      OPENAI_BASE_URL: "https://www.litechipcloud.cn/v1",
      OPENAI_API_KEY: "sk-lcc-test-key-000000000000",
      OPENAI_MODEL: "glm-5.3-flash",
    });
  });

  it("🔒 increment + 已指向其他服务 → skipped；replace 覆盖", () => {
    fs.mkdirSync(path.dirname(qwenFile()), { recursive: true });
    const other = JSON.stringify({ env: { OPENAI_BASE_URL: "https://api.other.com/v1", OPENAI_API_KEY: "sk-other" } });
    fs.writeFileSync(qwenFile(), other);
    expect(qwenCodeAdapter.configure(makeOptions()).skipped).toContain("increment");
    expect(fs.readFileSync(qwenFile(), "utf8")).toBe(other);

    qwenCodeAdapter.configure(makeOptions({ mode: "replace" }));
    expect(readJSON(qwenFile()).env.OPENAI_BASE_URL).toBe("https://www.litechipcloud.cn/v1");
  });

  it("dry-run 不落盘；verify 检查缺失项", () => {
    expect(qwenCodeAdapter.configure(makeOptions({ dryRun: true })).wrote).toBe(false);
    expect(fs.existsSync(qwenFile())).toBe(false);

    expect(qwenCodeAdapter.verify(makeOptions())[0]).toContain("不存在");
    qwenCodeAdapter.configure(makeOptions());
    expect(qwenCodeAdapter.verify(makeOptions())).toEqual([]);
    fs.writeFileSync(qwenFile(), JSON.stringify({ env: { OPENAI_BASE_URL: "https://www.litechipcloud.cn/v1" } }));
    expect(qwenCodeAdapter.verify(makeOptions()).some((e) => e.includes("OPENAI_API_KEY 缺失"))).toBe(true);
  });

  it("内容已一致 → 跳过写入且不产生新备份（ruler 同款幂等）；有差异仍正常写入", () => {
    qwenCodeAdapter.configure(makeOptions()); // 首次写入（新文件，本就不产生备份）
    const before = fs.readFileSync(qwenFile(), "utf8");

    const res = qwenCodeAdapter.configure(makeOptions()); // 二次：内容一致
    expect(res.wrote).toBe(false);
    expect(res.skipped).toContain("跳过写入");
    expect(fs.readFileSync(qwenFile(), "utf8")).toBe(before);
    const bak = fs.readdirSync(path.dirname(qwenFile())).filter((f) => f.includes(".bak-litegate-"));
    expect(bak).toHaveLength(0); // 不因重复运行刷备份

    // 外部改动后 replace 仍正常写入
    fs.writeFileSync(qwenFile(), JSON.stringify({ env: {} }));
    const res2 = qwenCodeAdapter.configure(makeOptions({ mode: "replace" }));
    expect(res2.wrote).toBe(true);
    expect(readJSON(qwenFile()).env.OPENAI_BASE_URL).toBe("https://www.litechipcloud.cn/v1");
  });
});
