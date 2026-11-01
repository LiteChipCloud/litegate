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
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { makeOptions, readJSON, sampleChatModels } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const PRIVACY_KEY = "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC";
const settings = () => path.join(tmpHome(), ".claude", "settings.json");

// 用例隔离：tmp home 在文件内共享，先清掉前序用例的 .claude 与 manifest
beforeEach(() => {
  fs.rmSync(path.join(tmpHome(), ".claude"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("claude-code detect", () => {
  it("无 .claude 目录 → present:false", () => {
    const info = claudeCodeAdapter.detect();
    expect(info.present).toBe(false);
    expect(info.configExists).toBe(false);
  });

  it("有 .claude 目录无 settings.json → present:true / configExists:false；写入后 configExists:true", () => {
    fs.mkdirSync(path.join(tmpHome(), ".claude"), { recursive: true });
    const info = claudeCodeAdapter.detect();
    expect(info.present).toBe(true);
    expect(info.configExists).toBe(false);

    fs.writeFileSync(settings(), "{}");
    expect(claudeCodeAdapter.detect().configExists).toBe(true);
  });
});

describe("claude-code configure（全新安装）", () => {
  it("写入 env 三项 + modelPicker，新建目录、无备份文件", () => {
    const res = claudeCodeAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const obj = readJSON(settings());
    expect(obj.env.ANTHROPIC_BASE_URL).toBe("https://www.litechipcloud.cn");
    expect(obj.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-lcc-test-key-000000000000");
    expect(obj.env[PRIVACY_KEY]).toBe("1");

    // modelPicker：8 个 chat 模型，排除 image/embedding
    const picker = obj.modelPicker;
    expect(picker.options).toHaveLength(sampleChatModels().length);
    expect(picker.options.map((o: any) => o.model)).toContain("glm-5.3-flash");
    expect(picker.options.map((o: any) => o.model)).not.toContain("agnes-image-2.5");
    expect(picker.options.map((o: any) => o.model)).not.toContain("wemm-embedding-2b");

    // 默认模型唯一且带标注；上下文缩写进 label
    const defaults = picker.options.filter((o: any) => o.label.includes("（默认）"));
    expect(defaults).toHaveLength(1);
    expect(defaults[0].model).toBe("glm-5.3-flash");
    expect(picker.options.find((o: any) => o.model === "glm-5.3-flash").label).toContain("1M");
    expect(picker.options.find((o: any) => o.model === "agnes-3.0").label).toContain("128K");

    // 全新安装不产生备份
    expect(fs.readdirSync(path.join(tmpHome(), ".claude"))).not.toContain(
      expect.stringMatching(/bak-litegate/),
    );
  });

  it("chatModels 为空 → 不写 modelPicker 字段", () => {
    const opts = makeOptions({ chatModels: [] });
    claudeCodeAdapter.configure(opts);
    expect(readJSON(settings()).modelPicker).toBeUndefined();
  });
});

describe("claude-code configure（已有用户配置，安全承诺）", () => {
  it("保留用户已有字段，追加 LiteGate 配置，且产生内容一致的备份", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), JSON.stringify({ theme: "dark", env: { MY_VAR: "keep" } }));

    const res = claudeCodeAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const obj = readJSON(settings());
    expect(obj.theme).toBe("dark");
    expect(obj.env.MY_VAR).toBe("keep");
    expect(obj.env.ANTHROPIC_BASE_URL).toBe("https://www.litechipcloud.cn");

    const bak = fs.readdirSync(path.dirname(settings())).find((f) => f.includes("bak-litegate"));
    expect(bak).toBeTruthy();
    const saved = JSON.parse(fs.readFileSync(path.join(path.dirname(settings()), bak!), "utf8"));
    expect(saved).toEqual({ theme: "dark", env: { MY_VAR: "keep" } });
  });

  it("🔒 increment 模式 + 已指向其他服务 → skipped 且文件一字不动", () => {
    const original = JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.other.com", ANTHROPIC_AUTH_TOKEN: "sk-other" } }, null, 2);
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), original);

    const res = claudeCodeAdapter.configure(makeOptions({ mode: "increment" }));

    expect(res.wrote).toBe(false);
    expect(res.skipped).toContain("increment");
    expect(fs.readFileSync(settings(), "utf8")).toBe(original); // 一字不动
  });

  it("replace 模式 + 已指向其他服务 → 覆盖为 LiteGate", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.other.com", ANTHROPIC_AUTH_TOKEN: "sk-other" } }));

    const res = claudeCodeAdapter.configure(makeOptions({ mode: "replace" }));

    expect(res.wrote).toBe(true);
    const obj = readJSON(settings());
    expect(obj.env.ANTHROPIC_BASE_URL).toBe("https://www.litechipcloud.cn");
    expect(obj.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-lcc-test-key-000000000000");
  });

  it("已指向 LiteGate → env 不重复写（changes 无 env 项），modelPicker 仍刷新", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://www.litechipcloud.cn", ANTHROPIC_AUTH_TOKEN: "sk-lcc-old" }, modelPicker: { options: [] } }));

    const res = claudeCodeAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    expect(res.changes.some((c) => c.includes("ANTHROPIC_BASE_URL"))).toBe(false);
    const obj = readJSON(settings());
    expect(obj.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-lcc-old"); // increment 保留旧 key
    expect(obj.modelPicker.options.length).toBeGreaterThan(0); // picker 刷新
  });

  it("🔒 用户已显式设置隐私开关（含 0）→ 不覆盖", () => {
    for (const v of ["0", "1"]) {
      fs.mkdirSync(path.dirname(settings()), { recursive: true });
      fs.writeFileSync(settings(), JSON.stringify({ env: { [PRIVACY_KEY]: v } }));
      claudeCodeAdapter.configure(makeOptions());
      expect(readJSON(settings()).env[PRIVACY_KEY]).toBe(v);
    }
  });
});

describe("claude-code configure（防御）", () => {
  it("非法 JSON → 拒绝修改且文件原样", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), "{broken");
    const res = claudeCodeAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");
    expect(fs.readFileSync(settings(), "utf8")).toBe("{broken");
  });

  it("🔒 dry-run → changes 有值但绝不落盘", () => {
    const res = claudeCodeAdapter.configure(makeOptions({ dryRun: true }));
    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(false);
    expect(res.changes.length).toBeGreaterThan(0);
    expect(fs.existsSync(settings())).toBe(false);
  });

  it("已有文件场景 dry-run → 内容不变、无新备份", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), '{"theme":"dark"}');
    const before = fs.readFileSync(settings(), "utf8");

    claudeCodeAdapter.configure(makeOptions({ dryRun: true }));

    expect(fs.readFileSync(settings(), "utf8")).toBe(before);
    expect(fs.readdirSync(path.dirname(settings())).filter((f) => f.includes("bak-litegate"))).toEqual([]);
  });
});

describe("claude-code verify / restore", () => {
  it("配置写入后 verify 无错误", () => {
    claudeCodeAdapter.configure(makeOptions());
    expect(claudeCodeAdapter.verify(makeOptions())).toEqual([]);
  });

  it("缺 modelPicker / 缺 token → 提示但不误报 baseUrl", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://www.litechipcloud.cn" } }));
    const errs = claudeCodeAdapter.verify(makeOptions());
    expect(errs.some((e) => e.includes("modelPicker"))).toBe(true);
    expect(errs.some((e) => e.includes("ANTHROPIC_AUTH_TOKEN 缺失"))).toBe(true);
  });

  it("restore 从备份完整还原", () => {
    fs.mkdirSync(path.dirname(settings()), { recursive: true });
    fs.writeFileSync(settings(), '{"original":true}');
    const bak = path.join(tmpHome(), "cc.bak");
    fs.copyFileSync(settings(), bak);
    fs.writeFileSync(settings(), '{"broken":true}');

    claudeCodeAdapter.restore(bak);
    expect(readJSON(settings())).toEqual({ original: true });
  });
});
