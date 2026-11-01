import { describe, it, expect, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

import fs from "node:fs";
import path from "node:path";
import { traeAdapter } from "../../src/adapters/trae.js";
import { makeOptions } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

/**
 * Trae 为 V0.2 待 PoC 适配器（docs/tool-config-storage.md）：
 * 契约是「明确拒绝写入 + 给出 UI 手动添加指引」，绝不误写文件。
 * （WorkBuddy 已于 V0.3 转正，见 workbuddy.test.ts）
 */
describe("V0.2 待 PoC 适配器（trae）", () => {
  it("configure 拒绝写入且 supported:false，文件零改动", () => {
    const res = traeAdapter.configure(makeOptions());
    expect(res.ok).toBe(false);
    expect(res.supported).toBe(false);
    expect(res.wrote).toBe(false);
    expect(res.skipped).toContain("V0.2");
    expect(traeAdapter.verify(makeOptions()).length).toBeGreaterThan(0);
    expect(() => traeAdapter.restore("whatever")).not.toThrow();
  });

  it("trae detect：globalStorage/state.vscdb 存在 → present / configExists", () => {
    const db = path.join(tmpHome(), "Library", "Application Support", "TRAE SOLO CN", "User", "globalStorage");
    fs.mkdirSync(db, { recursive: true });
    fs.writeFileSync(path.join(db, "state.vscdb"), "");

    const info = traeAdapter.detect();
    expect(info.present).toBe(true);
    expect(info.configExists).toBe(true);
    expect(info.configPath).toContain("state.vscdb");
    expect(info.detail).toContain("PoC");
  });
});
