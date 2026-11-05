import { describe, it, expect, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ADAPTERS, getAdapter } from "../../src/adapters/registry.js";
import { assertValidJSON, assertValidTOML, assertValidYAML } from "../../src/core/validate.js";
import { tmpHome } from "../helpers/tmp-home.js";

describe("adapter registry", () => {
  it("注册 14 个适配器且 id 唯一", () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual([
      "claude-code", "codex", "zcode", "minimax-code", "claude-desktop",
      "workbuddy", "codebuddy", "crush", "opencode", "zed", "qwen-code",
      "goose", "trae", "continue",
    ]);
    expect(new Set(ADAPTERS.map((a) => a.id)).size).toBe(ADAPTERS.length);
  });

  it("全部适配器声明写入范式（switch/coexist）", () => {
    for (const a of ADAPTERS) {
      expect(["switch", "coexist"]).toContain(a.strategy);
    }
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
  it("homedir 指向系统临时目录下（绝不允许指向真实用户目录）", () => {
    // 跨平台：mac 的 tmpdir 在 /var/folders、Windows 在 %TEMP%（含 Users 但不是真实 HOME）。
    // 两边都 realpath：mac 上 /tmp 是 /private/tmp 的软链，字符串前缀必须对称
    const tmpBase = fs.realpathSync(os.tmpdir());
    expect(tmpHome().startsWith(tmpBase)).toBe(true);
    // 真实 HOME 取进程环境（os.homedir 已被本文件 mock，不能用）
    const realHome = process.env.HOME ?? process.env.USERPROFILE ?? "";
    expect(realHome).toBeTruthy();
    expect(tmpHome()).not.toBe(realHome);
    expect(path.relative(tmpBase, tmpHome()).startsWith("..")).toBe(false);
  });
});
