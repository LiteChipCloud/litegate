import { describe, it, expect } from "vitest";
import path from "node:path";
import { homedir } from "node:os";
import { configPathFor as zedPathFor } from "../../src/adapters/zed.js";
import { configPathsFor as opencodePathsFor } from "../../src/adapters/opencode.js";
import { configPathFor as crushPathFor } from "../../src/adapters/crush.js";
import { configPathFor as claudeDesktopPathFor } from "../../src/adapters/claude-desktop.js";
import { TOOLS } from "../../src/core/detect.js";

/**
 * 平台路径纯函数测试：不 mock homedir，直接断言 configPathFor(<平台>) 的输出路径形态。
 * 预期值用 homedir() 现场拼装——函数契约就是「home + 各平台标准布局」。
 *
 * 路径证据（官方文档，详见各适配器源码注释）：
 *   zed       darwin/linux ~/.config/zed · win32 %APPDATA%\Zed（zed.dev/docs/git、/docs/debugger）
 *   opencode  三平台同构 <home>/.config/opencode（opencode.ai/docs/config、/docs/troubleshooting
 *             Windows 原文 %USERPROFILE%\.config\opencode\opencode.jsonc）
 *   crush     三平台同构 <home>/.config/crush（crush README：%USERPROFILE%\.config\crush\crushrc；
 *             %LOCALAPPDATA%\crush 只是机器态数据目录）
 *   claude-desktop darwin ~/Library/Application Support/Claude-3p（现状）；win32 %APPDATA%\Claude
 *             （modelcontextprotocol.io 官方 MCP 文档）；linux 无官方版本 → 未知路径 ""。
 */
describe("zed configPathFor", () => {
  it("darwin/linux 同走 XDG：~/.config/zed/settings.json", () => {
    const expected = path.join(homedir(), ".config", "zed", "settings.json");
    expect(zedPathFor("darwin")).toBe(expected);
    expect(zedPathFor("linux")).toBe(expected);
    expect(zedPathFor("darwin")).toContain(".config");
  });

  it("win32 走 %APPDATA%\\Zed（Roaming），不再误写 .config", () => {
    const p = zedPathFor("win32");
    expect(p).toBe(path.join(homedir(), "AppData", "Roaming", "Zed", "settings.json"));
    expect(p).toContain("AppData");
    expect(p).toContain("Zed");
    expect(p).not.toContain(".config");
  });
});

describe("opencode configPathsFor", () => {
  it("三平台同构：<home>/.config/opencode/opencode.json（.jsonc 次之）", () => {
    const json = path.join(homedir(), ".config", "opencode", "opencode.json");
    const jsonc = path.join(homedir(), ".config", "opencode", "opencode.jsonc");
    for (const platform of ["darwin", "linux", "win32"] as const) {
      expect(opencodePathsFor(platform)).toEqual([json, jsonc]);
    }
    expect(opencodePathsFor("win32")[0]).toContain(".config"); // 官方 Windows 也在 %USERPROFILE%\.config 下
  });
});

describe("crush configPathFor", () => {
  it("三平台同构：<home>/.config/crush/crush.json（Windows 不走 %LOCALAPPDATA% 数据目录）", () => {
    const expected = path.join(homedir(), ".config", "crush", "crush.json");
    expect(crushPathFor("darwin")).toBe(expected);
    expect(crushPathFor("linux")).toBe(expected);
    expect(crushPathFor("win32")).toBe(expected);
    expect(crushPathFor("win32")).not.toContain("AppData"); // %LOCALAPPDATA%\crush 是 state 目录，别混淆
  });
});

describe("claude-desktop configPathFor", () => {
  it("darwin 维持 macOS 现状：~/Library/Application Support/Claude-3p/configLibrary", () => {
    const p = claudeDesktopPathFor("darwin");
    expect(p).toBe(path.join(homedir(), "Library", "Application Support", "Claude-3p", "configLibrary"));
    expect(p).toContain("Library");
    expect(p).toContain("configLibrary");
  });

  it("win32 语义：只给官方证实的数据目录 %APPDATA%\\Claude（detect 用），不是 configLibrary 写入路径", () => {
    const p = claudeDesktopPathFor("win32");
    expect(p).toBe(path.join(homedir(), "AppData", "Roaming", "Claude"));
    expect(p).toContain("AppData");
    expect(p).toContain("Claude");
    // 关键差异：Windows 路径不带 configLibrary 后缀——configLibrary 推理 profile 是 macOS 3p 特性
    expect(p).not.toContain("configLibrary");
    expect(p).not.toContain("Library");
  });

  it("linux/未知平台：无官方版本 → 未知路径 \"\"（保守，不瞎猜）", () => {
    expect(claudeDesktopPathFor("linux")).toBe("");
    expect(claudeDesktopPathFor("freebsd")).toBe("");
  });
});

describe("detect.ts TOOLS 与平台函数同步", () => {
  it("zed/crush/opencode/claude-desktop 已入列，detect 路径走同一 configPathFor", () => {
    const ids = TOOLS.map((t) => t.id);
    for (const id of ["zed", "crush", "opencode", "claude-desktop"]) expect(ids).toContain(id);

    const detectOf = (id: string) => TOOLS.find((t) => t.id === id)!.detect();
    expect(detectOf("zed").configPath).toBe(zedPathFor(process.platform));
    expect(detectOf("crush").configPath).toBe(crushPathFor(process.platform));
    // opencode detect 可能在 json/jsonc 间择一存在，但都落在 .config/opencode 下
    expect(detectOf("opencode").configPath).toContain(path.join(".config", "opencode"));
    expect(detectOf("claude-desktop").configPath).toContain("Claude");
  });
});
