import { ADAPTERS } from "../adapters/registry.js";

export function runStatus(): void {
  console.log("\nLiteGate · 本机 AI 编程工具状态\n" + "─".repeat(60));
  for (const a of ADAPTERS) {
    const info = a.detect();
    const state = !info.present ? "未安装" : info.configExists ? "已安装" : "已安装（未初始化配置）";
    console.log(`${info.name.padEnd(16)} ${state.padEnd(20)} ${info.configPath}`);
  }
  console.log("\n提示：`litegate init` 一键接入 LiteGate\n");
}
