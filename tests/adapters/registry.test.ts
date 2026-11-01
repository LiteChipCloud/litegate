import { describe, it, expect, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

import { ADAPTERS, getAdapter } from "../../src/adapters/registry.js";
import { assertValidJSON, assertValidTOML, assertValidYAML } from "../../src/core/validate.js";
import { tmpHome } from "../helpers/tmp-home.js";

describe("adapter registry", () => {
  it("注册 8 个适配器且 id 唯一", () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual([
      "claude-code", "codex", "zcode", "minimax-code", "claude-desktop", "trae", "workbuddy", "continue",
    ]);
    expect(new Set(ADAPTERS.map((a) => a.id)).size).toBe(ADAPTERS.length);
  });

  it("getAdapter 命中 / 未命中", () => {
    expect(getAdapter("claude-code")?.name).toBe("Claude Code");
    expect(getAdapter("nope")).toBeUndefined();
  });
});

describe("validate", () => {
  it("三种格式合法输入 → 原样解析返回", () => {
    expect(assertValidJSON('{"a":1}', "x")).toEqual({ a: 1 });
    expect(assertValidTOML('a = 1', "x")).toEqual({ a: 1 });
    expect(assertValidYAML("a: 1\n", "x")).toEqual({ a: 1 });
  });

  it("非法输入 → 抛错且错误信息带 label", () => {
    expect(() => assertValidJSON("{broken", "Claude Code settings")).toThrow(/Claude Code settings/);
    expect(() => assertValidTOML("a = [broken", "Codex config")).toThrow(/Codex config/);
    expect(() => assertValidYAML("a: [broken", "MiniMax Code config")).toThrow(/MiniMax Code config/);
  });
});

describe("守卫：临时 HOME 全程生效", () => {
  it("homedir 指向 /tmp 下（绝不允许指向真实用户目录）", () => {
    expect(tmpHome().startsWith("/tmp/") || tmpHome().startsWith("/private/tmp/")).toBe(true);
    expect(tmpHome()).not.toContain("/Users/");
  });
});
