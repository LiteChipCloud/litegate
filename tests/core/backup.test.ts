import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 必须在 import 被测模块前声明（vitest 自动提升）；临时 HOME 见 helpers/tmp-home.ts
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { ensureTmpHome } = await import("../helpers/tmp-home.js");
  const dir = ensureTmpHome();
  const fake = { ...actual, homedir: () => dir } as typeof actual;
  return { ...fake, default: fake };
});

import fs from "node:fs";
import path from "node:path";
import { backupFile, readManifest, recordDryRun, rollbackAll, cliHome } from "../../src/core/backup.js";
import { tmpHome } from "../helpers/tmp-home.js";

// 每个用例从干净的 manifest 开始（tmp home 每个测试文件独立，但文件内用例共享）
beforeEach(() => {
  fs.rmSync(cliHome(), { recursive: true, force: true });
});

/** 守卫：manifest 必须落在临时 HOME 下，绝不写真实 ~/.litegate */
describe("tmp-home 守卫", () => {
  it("cliHome() 位于临时 HOME 下", () => {
    expect(cliHome().startsWith(tmpHome())).toBe(true);
  });
});

describe("backupFile", () => {
  it("生成 .bak-litegate-* 副本（内容一致）并在 manifest 记录操作", () => {
    const file = path.join(tmpHome(), "settings.json");
    fs.writeFileSync(file, '{"v":1}');

    const backup = backupFile("claude-code", file, "merge-env");

    expect(fs.existsSync(backup)).toBe(true);
    expect(path.basename(backup)).toMatch(/^settings\.json\.bak-litegate-\d+-[a-z0-9]{4}$/);
    expect(fs.readFileSync(backup, "utf8")).toBe('{"v":1}');

    const manifest = readManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.operations).toHaveLength(1);
    const op = manifest.operations[0];
    expect(op).toMatchObject({ tool: "claude-code", file, backup, action: "merge-env" });
  });

  it("同一文件连续两次备份（含同毫秒内）：两个副本互不顶掉，manifest 两条", () => {
    const file = path.join(tmpHome(), "twice.json");
    fs.writeFileSync(file, "first");
    const bak1 = backupFile("codex", file, "a");
    fs.writeFileSync(file, "second");
    const bak2 = backupFile("codex", file, "b"); // 不跨毫秒也必须不同名（随机后缀）

    expect(bak1).not.toBe(bak2);
    expect(fs.readFileSync(bak1, "utf8")).toBe("first");
    expect(fs.readFileSync(bak2, "utf8")).toBe("second");
    expect(readManifest().operations).toHaveLength(2);
  });
});

describe("recordDryRun", () => {
  it("记录 dry-run 操作（backup 为空，action 带 dry-run 标记）", () => {
    const file = path.join(tmpHome(), "dry.json");
    recordDryRun("zcode", file, "add-provider");
    const op = readManifest().operations.at(-1)!;
    expect(op.backup).toBe("");
    expect(op.action).toBe("add-provider (dry-run)");
  });
});

describe("readManifest", () => {
  it("manifest 不存在 → 空 operations", () => {
    expect(readManifest()).toEqual({ version: 1, operations: [] });
  });

  it("manifest 是坏 JSON → 不抛异常，按空处理", () => {
    fs.mkdirSync(cliHome(), { recursive: true });
    fs.writeFileSync(path.join(cliHome(), "manifest.json"), "{broken");
    expect(readManifest()).toEqual({ version: 1, operations: [] });
  });
});

describe("rollbackAll", () => {
  it("逆序恢复全部备份后清空 manifest", () => {
    const f1 = path.join(tmpHome(), "r1.json");
    const f2 = path.join(tmpHome(), "r2.json");
    fs.writeFileSync(f1, "v1");
    fs.writeFileSync(f2, "v1");
    backupFile("claude-code", f1, "m");
    backupFile("zcode", f2, "m");
    fs.writeFileSync(f1, "v2");
    fs.writeFileSync(f2, "v2");

    const { restored, errors } = rollbackAll();

    expect(errors).toEqual([]);
    expect(restored).toContain(f1);
    expect(restored).toContain(f2);
    expect(fs.readFileSync(f1, "utf8")).toBe("v1");
    expect(fs.readFileSync(f2, "utf8")).toBe("v1");
    expect(readManifest().operations).toEqual([]);
  });

  it("同一文件两次修改：恢复到最初版本（逆序两次覆盖）", () => {
    const f = path.join(tmpHome(), "multi.json");
    fs.writeFileSync(f, "v1");
    backupFile("codex", f, "a");
    fs.writeFileSync(f, "v2");
    backupFile("codex", f, "b");
    fs.writeFileSync(f, "v3");

    rollbackAll();

    expect(fs.readFileSync(f, "utf8")).toBe("v1");
  });

  it("dry-run 记录（无备份）进 errors，不阻断其余恢复", () => {
    const f = path.join(tmpHome(), "mix.json");
    fs.writeFileSync(f, "orig");
    recordDryRun("continue", f, "upsert-models");
    backupFile("continue", f, "upsert-models");
    fs.writeFileSync(f, "changed");

    const { restored, errors } = rollbackAll();

    expect(restored).toContain(f);
    expect(fs.readFileSync(f, "utf8")).toBe("orig");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("无备份可恢复");
  });

  it("备份文件被外部删除 → 进 errors 不抛异常", () => {
    const f = path.join(tmpHome(), "gone.json");
    fs.writeFileSync(f, "x");
    const bak = backupFile("codex", f, "a");
    fs.rmSync(bak);
    fs.writeFileSync(f, "y");

    const { restored, errors } = rollbackAll();

    expect(restored).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(fs.readFileSync(f, "utf8")).toBe("y"); // 原样未动
  });
});
