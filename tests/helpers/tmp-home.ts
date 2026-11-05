import fs from "node:fs";
import path from "node:path";

/**
 * 测试专用临时 HOME（替代真实 ~，第一纪律：测试绝不碰真实用户目录）。
 *
 * 用法：在每个测试文件顶部（import 被测模块之前）写：
 *
 *   vi.mock("node:os", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("node:os")>();
 *     const { ensureTmpHome } = await import("./helpers/tmp-home.js");
 *     const dir = ensureTmpHome();
 *     const fake = { ...actual, homedir: () => dir } as typeof actual;
 *     return { ...fake, default: fake };
 *   });
 *
 * 工厂在 src 模块首次被 import 时执行，届时 ensureTmpHome() 已创建好
 * 每个测试文件独立的临时目录（vitest 按文件隔离，互不串扰）。
 * 注意：本文件不得 import node:os（会撞上 mock 工厂造成循环）。
 */

const state = { home: "" };

/**
 * 系统临时目录：走 process.env 而非 os.tmpdir()——本文件被 vi.mock("node:os") 的
 * 工厂内部 import，此处再 import node:os 会形成循环依赖死锁（工厂等本模块、
 * 本模块的 os 等工厂）。env 链跨平台：mac=TMPDIR、Windows=TEMP/TMP。
 */
function systemTmp(): string {
  return process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? "/tmp";
}

/** 首次调用创建临时 HOME，之后返回同一个（每个测试文件一个） */
export function ensureTmpHome(): string {
  if (!state.home) {
    state.home = fs.mkdtempSync(path.join(fs.realpathSync(systemTmp()), "litegate-test-home-"));
  }
  return state.home;
}

/** 测试体内取当前临时 HOME 路径（未初始化说明 mock 没接上，直接失败） */
export function tmpHome(): string {
  if (!state.home) throw new Error("tmp home 未初始化：测试文件缺少 node:os mock");
  return state.home;
}
