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
import { workbuddyAdapter } from "../../src/adapters/workbuddy.js";
import { makeOptions } from "../helpers/fixtures.js";
import { tmpHome } from "../helpers/tmp-home.js";

/**
 * Trae / WorkBuddy 均为 V0.2 待 PoC 适配器（docs/tool-config-storage.md）：
 * 契约是「明确拒绝写入 + 给出 UI 手动添加指引」，绝不误写文件。
 */
describe("V0.2 待 PoC 适配器（trae / workbuddy）", () => {
  it("configure 拒绝写入且 supported:false，文件零改动", () => {
    for (const a of [traeAdapter, workbuddyAdapter]) {
      const res = a.configure(makeOptions());
      expect(res.ok).toBe(false);
      expect(res.supported).toBe(false);
      expect(res.wrote).toBe(false);
      expect(res.skipped).toContain("V0.2");
      expect(a.verify(makeOptions()).length).toBeGreaterThan(0); // verify 也如实报告未支持
      expect(() => a.restore("whatever")).not.toThrow(); // restore 空操作
    }
    // tmp home 不应出现任何写入痕迹
    expect(fs.existsSync(path.join(tmpHome(), ".workbuddy", "models.json"))).toBe(false);
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

  it("workbuddy detect：数据目录 / models.json 存在性", () => {
    fs.mkdirSync(path.join(tmpHome(), ".workbuddy"), { recursive: true });
    let info = workbuddyAdapter.detect();
    expect(info.present).toBe(true);
    expect(info.configExists).toBe(false);

    fs.writeFileSync(path.join(tmpHome(), ".workbuddy", "models.json"), "[]");
    info = workbuddyAdapter.detect();
    expect(info.configExists).toBe(true);
  });
});
