import { ADAPTERS } from "../adapters/registry.js";

export function runStatus(): void {
  console.log("\nLiteGate · 本机 AI 编程工具状态\n" + "─".repeat(72));
  for (const a of ADAPTERS) {
    const info = a.detect();
    if (!info.present) {
      console.log(`${info.name.padEnd(16)} 未安装`);
      continue;
    }
    let litegate = "未接入";
    try {
      const errs = a.verify({
        apiKey: "", baseUrlAnthropic: "https://www.litechipcloud.cn",
        baseUrlOpenAI: "https://www.litechipcloud.cn/v1",
        models: [], chatModels: [], defaultModelKey: "", mode: "increment", dryRun: true,
      }, info);
      litegate = errs.length === 0 ? "已接入 ✓" : "未接入";
    } catch { litegate = "未知"; }
    console.log(`${info.name.padEnd(16)} ${info.configExists ? "已配置" : "未初始化"}  LiteGate: ${litegate}`);
    console.log(`${" ".repeat(16)} ${info.configPath}`);
  }
  console.log("\n提示：`litegate init` 一键接入 · `litegate doctor` 环境诊断\n");
}
