import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

// Claude Desktop 的 appRunning() 会 pgrep 真实进程——mock 掉：默认未运行
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => Buffer.from("")),
}));

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { claudeDesktopAdapter } from "../../src/adapters/claude-desktop.js";
import { makeOptions, readJSON } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

const appSupport = () => path.join(tmpHome(), "Library", "Application Support");

/**
 * claude-desktop 的写入语义是 macOS 专属（configLibrary 推理 profile 是 macOS 3p
 * 部署特性；win32/linux 适配器明确 skipped——见 platform-paths.test.ts 的平台表）。
 * 因此写入/verify 用例仅在 darwin 执行；非 darwin 平台由底部的语义锁用例覆盖。
 */
const itMac = process.platform === "darwin" ? it : it.skip;
const itNotMac = process.platform === "darwin" ? it.skip : it;
const profileOf = (dirName: string) => {
  const meta = readJSON(path.join(appSupport(), dirName, "configLibrary", "_meta.json"));
  return path.join(appSupport(), dirName, "configLibrary", `${meta.appliedId}.json`);
};

beforeEach(() => {
  vi.mocked(execSync).mockClear();
  vi.mocked(execSync).mockReturnValue(Buffer.from(""));
  fs.rmSync(path.join(tmpHome(), "Library"), { recursive: true, force: true });
  fs.rmSync(path.join(tmpHome(), ".litegate"), { recursive: true, force: true });
});

describe("claude-desktop configure（全新安装）", () => {
  itMac("创建 Claude-3p/configLibrary + _meta.json + gateway profile，权限 600", () => {
    const res = claudeDesktopAdapter.configure(makeOptions());

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    const profile = profileOf("Claude-3p");
    const obj = readJSON(profile);
    expect(obj.inferenceProvider).toBe("gateway");
    expect(obj.inferenceCredentialKind).toBe("static");
    expect(obj.inferenceGatewayBaseUrl).toBe("https://www.litechipcloud.cn");
    expect(obj.inferenceGatewayApiKey).toBe("sk-lcc-test-key-000000000000");
    expect(fs.statSync(profile).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(appSupport(), "Claude-3p", "configLibrary", "_meta.json"))).toBe(true);
  });
});

describe("claude-desktop configure（已有安装）", () => {
  const seed = (dirName: string, withApplied = true) => {
    const lib = path.join(appSupport(), dirName, "configLibrary");
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(lib, "_meta.json"), JSON.stringify(withApplied ? { appliedId: "existing-1", entries: [{ id: "existing-1", name: "Default" }] } : {}));
    if (withApplied) fs.writeFileSync(path.join(lib, "existing-1.json"), JSON.stringify({ inferenceProvider: "gateway", inferenceGatewayApiKey: "sk-lcc-old" }));
    return lib;
  };

  itMac("已有 appliedId → 更新现有 profile，不新建", () => {
    seed("Claude-3p");
    const res = claudeDesktopAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const lib = path.join(appSupport(), "Claude-3p", "configLibrary");
    expect(fs.readdirSync(lib).filter((f) => f.endsWith(".json") && f !== "_meta.json")).toEqual(["existing-1.json"]);
    expect(readJSON(path.join(lib, "existing-1.json")).inferenceGatewayApiKey).toBe("sk-lcc-test-key-000000000000");
  });

  itMac("目录在但无 appliedId → 新建 profile 并写 _meta", () => {
    seed("Claude-3p", false);
    const res = claudeDesktopAdapter.configure(makeOptions());

    expect(res.wrote).toBe(true);
    const profile = profileOf("Claude-3p");
    expect(readJSON(profile).inferenceProvider).toBe("gateway");
  });

  itMac("探测顺序：Claude-3p 优先于 Claude", () => {
    seed("Claude");
    seed("Claude-3p");
    claudeDesktopAdapter.configure(makeOptions());
    expect(readJSON(profileOf("Claude-3p")).inferenceGatewayApiKey).toBe("sk-lcc-test-key-000000000000");
  });

  itMac("profile 非法 JSON → 拒绝修改", () => {
    seed("Claude-3p");
    fs.writeFileSync(profileOf("Claude-3p"), "{broken");
    const res = claudeDesktopAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("不是合法 JSON");
  });

  itMac("🔒 Claude 进程运行中 → skipped，不写任何文件", () => {
    seed("Claude-3p");
    vi.mocked(execSync).mockReturnValue(Buffer.from("12345\n"));

    const res = claudeDesktopAdapter.configure(makeOptions());

    expect(res.ok).toBe(false);
    expect(res.skipped).toContain("退出 Claude");
    expect(readJSON(profileOf("Claude-3p")).inferenceGatewayApiKey).toBe("sk-lcc-old"); // 原样
  });

  itMac("已有 profile 写入前产生备份", () => {
    seed("Claude-3p");
    claudeDesktopAdapter.configure(makeOptions());
    expect(fs.readdirSync(path.join(appSupport(), "Claude-3p", "configLibrary")).some((f) => f.includes("bak-litegate"))).toBe(true);
  });
});

describe("claude-desktop verify", () => {
  itMac("写入后 verify 无错误", () => {
    claudeDesktopAdapter.configure(makeOptions());
    expect(claudeDesktopAdapter.verify(makeOptions())).toEqual([]);
  });

  itMac("非 sk-lcc key → 报告", () => {
    const lib = path.join(appSupport(), "Claude-3p", "configLibrary");
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(lib, "_meta.json"), JSON.stringify({ appliedId: "p1", entries: [] }));
    fs.writeFileSync(path.join(lib, "p1.json"), JSON.stringify({ inferenceProvider: "gateway", inferenceGatewayBaseUrl: "https://www.litechipcloud.cn", inferenceGatewayApiKey: "sk-other" }));
    const errs = claudeDesktopAdapter.verify(makeOptions());
    expect(errs.some((e) => e.includes("sk-lcc"))).toBe(true);
  });
});

describe("claude-desktop 非 darwin 语义锁", () => {
  itNotMac("configure 返回 skipped 且 supported:true，不写任何文件", () => {
    const res = claudeDesktopAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.supported).toBe(true);
    expect(res.wrote).toBe(false);
    expect(res.skipped).toBeTruthy();
  });
});
