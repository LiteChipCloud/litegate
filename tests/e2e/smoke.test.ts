/**
 * E2E 冒烟测试 —— 真实进程跑 build 出的 dist/index.js（零 mock）。
 *
 * 背景：原 121 个单测全部 mock 文件系统，dist/index.js 从未以真实 CLI 进程跑过，
 * 曾因此漏掉 claude-desktop 全新安装崩溃 bug。本层用 node:child_process 的
 * spawnSync 以独立临时 HOME（mkdtempSync）启动真实 node 进程做冒烟：
 *   - HOME / USERPROFILE 指向临时目录 → 所有配置读写都落在沙箱里，不碰真实用户目录；
 *   - spawnSync timeout 60s 防挂死（交互式分支已用 --key/--tools/--yes 全参数绕开）。
 *
 * 分两层：
 *   - 离线层：不依赖网络。「网络不可达」场景用 NODE_OPTIONS --require 注入 preload、
 *     把 globalThis.fetch 替换为必失败实现来确定性模拟（见 helpers.createOfflineFetchPreload）。
 *   - 在线层：依赖外部网关 www.litechipcloud.cn 的公开定价接口。本文件加载时先探测一次，
 *     不可达则整组 describe.skipIf 跳过；本地验证请跑：`npx vitest run tests/e2e`。
 *
 * 纪律：本文件与 helpers.ts 是 E2E 层仅有的新增文件；不改 package.json / src / 现有测试。
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import TOML from "@iarna/toml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DIST_INDEX,
  REPO_ROOT,
  checkGatewayOnline,
  cleanupTmpHomes,
  createOfflineFetchPreload,
  makeTmpHome,
  readPkgVersion,
  runCli,
} from "./helpers.js";

// 在线层门禁：模块加载时探测一次定价接口（最多 8s），不可达 → 在线层整组 skip
const gatewayOnline = await checkGatewayOnline();

describe("LiteGate CLI E2E 冒烟（真实进程 dist/index.js）", () => {
  beforeAll(() => {
    // 按设计用 npx tsc 构建产物（dist/ 在 .gitignore）；编译失败则整组直接报错
    execFileSync("npx", ["tsc"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 });
    expect(fs.existsSync(DIST_INDEX), "tsc 构建后 dist/index.js 应存在").toBe(true);
  }, 150_000);

  afterAll(() => {
    cleanupTmpHomes();
  });

  describe("离线层（不依赖网络）", () => {
    it("--version：exit 0，输出 package.json 版本号", () => {
      const r = runCli(["--version"], { home: makeTmpHome() });
      expect(r.timedOut).toBe(false);
      expect(r.status, `stdout=${r.stdout} stderr=${r.stderr}`).toBe(0);
      expect(r.stdout).toContain(readPkgVersion());
    }, 60_000);

    it("--help：exit 0，列出全部六个子命令", () => {
      const r = runCli(["--help"], { home: makeTmpHome() });
      expect(r.timedOut).toBe(false);
      expect(r.status).toBe(0);
      for (const cmd of ["init", "status", "models", "switch", "rollback", "doctor"]) {
        expect(r.stdout, `help 应包含子命令 ${cmd}`).toContain(cmd);
      }
    }, 60_000);

    it("status：空白临时 HOME（无任何工具）→ exit 0，纯本地检测友好降级不崩溃", () => {
      const r = runCli(["status"], { home: makeTmpHome() });
      expect(r.timedOut).toBe(false);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("本机 AI 编程工具状态");
      // tmp HOME 下 .claude 等目录不存在，claude-code 必然报「未安装」而非抛异常
      expect(r.stdout).toContain("未安装");
    }, 60_000);

    it("status：tmp HOME 预置 LiteGate 化的 .claude/settings.json → 识别出 Claude Code 已接入", () => {
      // 纯本地路径（status 不访问网络），放离线层保证任何环境都跑
      const home = makeTmpHome();
      fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".claude", "settings.json"),
        JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: "https://www.litechipcloud.cn",
            ANTHROPIC_AUTH_TOKEN: "sk-lcc-e2e-test",
          },
          modelPicker: { options: [{ model: "glm-5.3-flash", label: "GLM-5.3-Flash" }] },
        }),
      );
      const r = runCli(["status"], { home });
      expect(r.timedOut).toBe(false);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Claude Code\s+已配置\s+LiteGate: 已接入/);
    }, 60_000);

    it("models（网络不可达）：exit 1 且报错信息含「获取失败」——失败路径优雅", () => {
      const home = makeTmpHome();
      const preload = createOfflineFetchPreload(home);
      const r = runCli(["models"], { home, env: { NODE_OPTIONS: `--require=${preload}` } });
      expect(r.timedOut).toBe(false);
      expect(r.status, `stdout=${r.stdout} stderr=${r.stderr}`).toBe(1);
      expect(r.stderr).toContain("获取失败");
    }, 60_000);
  });

  describe.skipIf(!gatewayOnline)("在线层（依赖真实网关 www.litechipcloud.cn）", () => {
    it("init --dry-run：exit 0，settings.json 不存在（dry-run 不落盘）", () => {
      const home = makeTmpHome();
      // init 的 --tools 只接受「已检测到」的工具：预置 .claude/ 让 detect present=true
      fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
      const r = runCli(
        ["init", "--dry-run", "--key", "sk-lcc-e2e-test", "--tools", "claude-code", "--yes"],
        { home },
      );
      expect(r.timedOut).toBe(false);
      expect(r.status, `stdout=${r.stdout} stderr=${r.stderr}`).toBe(0);
      expect(fs.existsSync(path.join(home, ".claude", "settings.json"))).toBe(false);
    }, 90_000);

    it("init claude-code：exit 0，settings.json 写入 LiteGate env 与非空 modelPicker", () => {
      const home = makeTmpHome();
      fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
      const r = runCli(["init", "--key", "sk-lcc-e2e-test", "--tools", "claude-code", "--yes"], { home });
      expect(r.timedOut).toBe(false);
      expect(r.status, `stdout=${r.stdout} stderr=${r.stderr}`).toBe(0);
      const file = path.join(home, ".claude", "settings.json");
      expect(fs.existsSync(file)).toBe(true);
      const obj = JSON.parse(fs.readFileSync(file, "utf8")) as {
        env: Record<string, string>;
        modelPicker?: { options: unknown[] };
      };
      expect(obj.env.ANTHROPIC_BASE_URL).toContain("www.litechipcloud.cn");
      expect(obj.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-lcc-e2e-test");
      // 隐私加固开关应一并写入
      expect(obj.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
      expect((obj.modelPicker?.options ?? []).length, "modelPicker.options 应非空").toBeGreaterThan(0);
    }, 90_000);

    it("init codex：config.toml 含 wire_api = \"responses\"，模型目录落盘", () => {
      const home = makeTmpHome();
      fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
      const r = runCli(["init", "--key", "sk-lcc-e2e-test", "--tools", "codex", "--yes"], { home });
      expect(r.timedOut).toBe(false);
      expect(r.status, `stdout=${r.stdout} stderr=${r.stderr}`).toBe(0);
      const toml = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
      expect(toml).toContain('model_provider = "litegate"');
      expect(toml).toContain('wire_api = "responses"');
      expect(fs.existsSync(path.join(home, ".codex", "litegate-model-catalog.json"))).toBe(true);
    }, 90_000);

    it("🔒 codex 幂等：已接入后重复 init（含 dry-run）均 exit 0，托管段恰 1 个不重复", () => {
      const home = makeTmpHome();
      fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
      const args = ["init", "--key", "sk-lcc-e2e-test", "--tools", "codex"];
      // 旧版（≤0.6.x npm 包）此处会报 TOML「Can't redefine existing key」——
      // 当前标记段幂等设计必须保持；此用例把该语义锁在真实进程层
      for (const extra of [["--yes"], ["--dry-run", "--yes"], ["--yes"]]) {
        const r = runCli([...args, ...extra], { home });
        expect(r.timedOut).toBe(false);
        expect(r.status, `args=${extra.join(" ")} stdout=${r.stdout} stderr=${r.stderr}`).toBe(0);
      }
      const toml = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
      expect(toml.split("# >>> LiteGate begin")).toHaveLength(2); // 恰 1 个标记段
      TOML.parse(toml); // 合法 TOML（旧版 bug 即此处抛重复键）
      expect((TOML.parse(toml) as any).model_provider).toBe("litegate");
    }, 120_000);
  });
});
