import { rollbackAll } from "../core/backup.js";

export function runRollback(): void {
  const { restored, errors } = rollbackAll();
  console.log("\nLiteGate · 回滚\n" + "─".repeat(60));
  for (const f of restored) console.log("✔ 已恢复 " + f);
  for (const e of errors) console.log("⚠ " + e);
  if (restored.length === 0 && errors.length === 0) console.log("没有需要回滚的变更");
  console.log();
}
