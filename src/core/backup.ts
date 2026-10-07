import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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
  const backup = `${file}.bak-litegate-${ts}`;
  fs.copyFileSync(file, backup);
  const m = readManifest();
  m.operations.push({ ts: new Date().toISOString(), tool, file, backup, action, patch: [] });
  fs.mkdirSync(path.dirname(manifestPath()), { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2));
  return backup;
}

export function recordDryRun(tool: string, file: string, action: string): void {
  const m = readManifest();
  m.operations.push({ ts: new Date().toISOString(), tool, file, backup: "", action: action + " (dry-run)", patch: [] });
  fs.mkdirSync(path.dirname(manifestPath()), { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2));
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
  fs.writeFileSync(manifestPath(), JSON.stringify({ version: 1, operations: [] }, null, 2));
  return { restored, errors };
}
