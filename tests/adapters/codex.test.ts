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
import TOML from "@iarna/toml";
import { codexAdapter } from "../../src/adapters/codex.js";
import { makeOptions } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const MARK_BEGIN = "# >>> LiteGate begin (managed by @litechipcloud/litegate) <<<";
const configToml = () => path.join(tmpHome(), ".codex", "config.toml");
const catalogJson = () => path.join(tmpHome(), ".codex", "litegate-model-catalog.json");

const parse = () => TOML.parse(fs.readFileSync(configToml(), "utf8")) as Record<string, any>;

beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".codex"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("codex configure（全新安装）", () => {
  it("写入 provider 段：model_provider / model / wire_api=responses / key 内联", () => {
    const res = codexAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const obj = parse();
    expect(obj.model_provider).toBe("litegate");
    expect(obj.model).toBe("glm-5.3-flash");
    const lg = obj.model_providers.litegate;
    expect(lg.base_url).toBe("https://www.litechipcloud.cn/v1");
    expect(lg.experimental_bearer_token).toBe("sk-lcc-test-key-000000000000");
    // 0.7.x 修复回归锁：Codex CLI 已弃用 chat 协议
    expect(lg.wire_api).toBe("responses");
  });

  it("生成模型目录 json：仅 chat 模型、slug/context 传递、priority 递减", () => {
    codexAdapter.configure(makeOptions());

    const catalogPath = parse().model_catalog_json as string;
    expect(catalogPath).toBe(catalogJson());
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    expect(catalog.models).toHaveLength(8); // chat 模型数
    expect(catalog.models.map((x: any) => x.slug)).toContain("glm-5.3-flash");
    expect(catalog.models.map((x: any) => x.slug)).not.toContain("agnes-image-2.5");
    expect(catalog.models[0].priority).toBe(100);
    expect(catalog.models[0].context_window).toBe(1_000_000);
    expect(catalog.models[0].display_name).toBe("GLM-5.3-Flash");
  });

  it("全新安装无 .bak 备份", () => {
    codexAdapter.configure(makeOptions());
    expect(fs.readdirSync(path.join(tmpHome(), ".codex")).some((f) => f.includes("bak-litegate"))).toBe(false);
  });
});

describe("codex configure（已有配置）", () => {
  it("用户已有 TOML 内容保留，LiteGate 段前置追加", () => {
    fs.mkdirSync(path.dirname(configToml()), { recursive: true });
    fs.writeFileSync(configToml(), 'model = "gpt-5"\n\n[model_providers.openai]\nname = "OpenAI"\n');

    codexAdapter.configure(makeOptions());

    const obj = parse();
    expect(obj.model).toBe("glm-5.3-flash"); // 托管段在前，生效
    expect(obj.model_providers.openai.name).toBe("OpenAI"); // 用户段保留
    // 备份与原内容一致
    const bak = fs.readdirSync(path.dirname(configToml())).find((f) => f.includes("bak-litegate"))!;
    expect(fs.readFileSync(path.join(path.dirname(configToml()), bak), "utf8")).toBe('model = "gpt-5"\n\n[model_providers.openai]\nname = "OpenAI"\n');
  });

  it("🔒 幂等：重复 init 不产生重复托管段", () => {
    codexAdapter.configure(makeOptions({ apiKey: "sk-lcc-first" }));
    codexAdapter.configure(makeOptions({ apiKey: "sk-lcc-second" }));

    const text = fs.readFileSync(configToml(), "utf8");
    expect(text.split(MARK_BEGIN)).toHaveLength(2); // 标记段恰好 1 个
    const obj = parse();
    expect(obj.model_provider).toBe("litegate");
    expect(obj.model_providers.litegate.experimental_bearer_token).toBe("sk-lcc-second"); // 后写生效
  });
});

describe("codex configure（防御）", () => {
  it("🔒 dry-run：config.toml 与模型目录都不落盘", () => {
    const res = codexAdapter.configure(makeOptions({ dryRun: true }));

    expect(res.wrote).toBe(false);
    expect(fs.existsSync(configToml())).toBe(false);
    expect(fs.existsSync(catalogJson())).toBe(false);
  });
});

describe("codex verify", () => {
  it("正常写入后 verify 无错误", () => {
    codexAdapter.configure(makeOptions());
    expect(codexAdapter.verify(makeOptions())).toEqual([]);
  });

  it("模型目录被删 → verify 报告且不误报其他项", () => {
    codexAdapter.configure(makeOptions());
    fs.rmSync(catalogJson());
    const errs = codexAdapter.verify(makeOptions());
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("模型目录文件不存在");
  });

  it("配置文件不存在 → verify 报告缺失", () => {
    const errs = codexAdapter.verify(makeOptions());
    expect(errs[0]).toContain("不存在");
  });
});

describe("codex restore", () => {
  it("从备份还原", () => {
    fs.mkdirSync(path.dirname(configToml()), { recursive: true });
    fs.writeFileSync(configToml(), 'model = "orig"\n');
    const bak = path.join(tmpHome(), "codex.bak");
    fs.copyFileSync(configToml(), bak);
    fs.writeFileSync(configToml(), 'model = "changed"\n');

    codexAdapter.restore(bak);
    expect((parse() as any).model).toBe("orig");
  });
});
