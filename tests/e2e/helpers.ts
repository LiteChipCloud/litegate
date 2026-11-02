import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * E2E 冒烟基建：真实进程驱动 dist/index.js，绝不 mock、绝不碰真实用户目录。
 *
 * 与单测的 tests/helpers/tmp-home.ts（vi.mock node:os）不同——这里不需要 mock：
 * CLI 进程是 spawnSync 起的独立进程，HOME/USERPROFILE 直接指向临时目录，
 * node:os.homedir() 在子进程里天然解析到该目录。
 */

/** 仓库根（本文件位于 tests/e2e/，上两级） */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** E2E 驱动的真实产物（beforeAll 里 npx tsc 重新构建，dist/ 在 .gitignore） */
export const DIST_INDEX = path.join(REPO_ROOT, "dist", "index.js");

/** LiteGate 公开定价接口（在线层可达性探测用，与 src/core/litegate-api.ts 同源） */
export const PRICING_URL = "https://www.litechipcloud.cn/admin-api/ai/litegate/model/pricing";

/** 单次 CLI 进程超时保护 */
const CLI_TIMEOUT_MS = 60_000;

/** 本文件创建过的全部临时 HOME（afterAll 统一清理） */
const tmpHomes: string[] = [];

/** 每个用例一个独立临时 HOME（mkdtempSync，互不串扰） */
export function makeTmpHome(): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "litegate-e2e-home-"));
  tmpHomes.push(dir);
  return dir;
}

/** 统一清理全部临时 HOME */
export function cleanupTmpHomes(): void {
  for (const dir of tmpHomes.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export interface CliResult {
  /** 进程退出码；超时/被信号杀死时为 null */
  status: number | null;
  stdout: string;
  stderr: string;
  /** spawnSync 超时（60s 保护触发） */
  timedOut: boolean;
}

/** @clack/prompts 的输出带 ANSI/光标控制序列，断言前统一剥掉 */
const ANSI_RE = /\u001B\[[0-9;?]*[A-Za-z]|\u001B\][^\u0007]*\u0007/g;

function stripAnsi(s: unknown): string {
  return String(s ?? "").replace(ANSI_RE, "");
}

/**
 * 以真实 CLI 进程跑 dist/index.js。
 * HOME/USERPROFILE 指向临时目录；env 覆盖项放最后（可整体替换 NODE_OPTIONS 等）。
 * 返回的 stdout/stderr 已去 ANSI 转义，便于 toContain / 正则断言。
 */
export function runCli(args: string[], opts: { home: string; env?: Record<string, string> }): CliResult {
  const res = spawnSync(process.execPath, [DIST_INDEX, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: opts.home, USERPROFILE: opts.home, ...opts.env },
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
  });
  const timedOut = !!res.error && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  return {
    status: res.status,
    stdout: stripAnsi(res.stdout),
    stderr: stripAnsi(res.stderr),
    timedOut,
  };
}

/** package.json 版本号（--version 断言的期望值） */
export function readPkgVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

/**
 * 离线模拟：往临时 HOME 写一个 preload（.cjs），把 globalThis.fetch 替换为必失败实现，
 * 确定性制造「网络不可达」。经 NODE_OPTIONS --require 注入子进程，不引新依赖、不改 src。
 */
export function createOfflineFetchPreload(home: string): string {
  const file = path.join(home, "offline-fetch.cjs");
  fs.writeFileSync(
    file,
    "// E2E 离线模拟：所有 fetch 一律网络失败（模拟网关不可达）\n" +
      'globalThis.fetch = () => Promise.reject(new Error("E2E_OFFLINE: network disabled by test"));\n',
  );
  return file;
}

let gatewayProbe: Promise<boolean> | null = null;

/**
 * 在线层门禁：探测一次公开定价接口（最多等 8s），结果缓存。
 * 不可达 → smoke.test.ts 用 describe.skipIf 跳过整组在线用例。
 */
export function checkGatewayOnline(): Promise<boolean> {
  gatewayProbe ??= fetch(PRICING_URL, { signal: AbortSignal.timeout(8_000) })
    .then((r) => r.ok)
    .catch(() => false);
  return gatewayProbe;
}
