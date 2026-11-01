import fs from "node:fs";
import path from "node:path";
import os from "node:os";
// @ts-expect-error write-file-atomic 未随包提供类型声明（CJS 包，sync 版本挂在 .sync 上）
import writeFileAtomic from "write-file-atomic";

/** 原子写（temp 文件 + rename，保留既有 mode/chown），签名同 fs.writeFileSync。 */
const writeFileSyncAtomic: typeof fs.writeFileSync = writeFileAtomic.sync;

export interface BackupEntry {
  ts: string;
  tool: string;
  file: string;
  backup: string;
  action: string;
  patch: string[];
}

export function cliHome(): string {
  return path.join(os.homedir(), ".litegate", "cli");
}

function manifestPath(): string {
  return path.join(cliHome(), "manifest.json");
}

export function readManifest(): { version: number; operations: BackupEntry[] } {
  const p = manifestPath();
  if (!fs.existsSync(p)) return { version: 1, operations: [] };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { version: 1, operations: [] };
  }
}

export function backupFile(tool: string, file: string, action: string): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "");
  // 追加随机后缀：时间戳只到毫秒，同毫秒内对同一文件连续备份会同名互覆，
  // 导致早期备份丢失、rollback 回不到最初版本
  const rand = Math.random().toString(36).slice(2, 6);
  const backup = `${file}.bak-litegate-${ts}-${rand}`;
  fs.copyFileSync(file, backup);
  const m = readManifest();
  m.operations.push({ ts: new Date().toISOString(), tool, file, backup, action, patch: [] });
  fs.mkdirSync(path.dirname(manifestPath()), { recursive: true });
  writeFileSyncAtomic(manifestPath(), JSON.stringify(m, null, 2));
  return backup;
}

export function recordDryRun(tool: string, file: string, action: string): void {
  const m = readManifest();
  m.operations.push({ ts: new Date().toISOString(), tool, file, backup: "", action: action + " (dry-run)", patch: [] });
  fs.mkdirSync(path.dirname(manifestPath()), { recursive: true });
  writeFileSyncAtomic(manifestPath(), JSON.stringify(m, null, 2));
}

export function rollbackAll(): { restored: string[]; errors: string[] } {
  const m = readManifest();
  const restored: string[] = [];
  const errors: string[] = [];
  for (const op of [...m.operations].reverse()) {
    if (!op.backup || !fs.existsSync(op.backup)) {
      errors.push(`${op.file}（无备份可恢复）`);
      continue;
    }
    try {
      fs.copyFileSync(op.backup, op.file);
      restored.push(op.file);
    } catch (e) {
      errors.push(`${op.file}: ${(e as Error).message}`);
    }
  }
  writeFileSyncAtomic(manifestPath(), JSON.stringify({ version: 1, operations: [] }, null, 2));
  return { restored, errors };
}
