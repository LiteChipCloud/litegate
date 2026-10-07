#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runRollback } from "./commands/rollback.js";
import { runDoctor } from "./commands/doctor.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("litegate")
  .description("LiteGate Cli —— 一条命令，把 AI 编程工具全部接上 LiteGate（13 款模型 · 双协议 · 免费模型）")
  .version(version);

program
  .command("init")
  .description("检测本机 AI 编程工具并交互式接入 LiteGate")
  .option("--mode <mode>", "increment（追加，推荐）| replace（覆盖同名配置）", "increment")
  .option("--key <key>", "LiteGate API Key（sk-lcc-…，不传则交互输入）")
  .option("--tools <tools>", "逗号分隔工具 id（claude-code,codex,zcode,minimax-code），默认全部已装工具")
  .option("--dry-run", "预览变更，不写任何文件")
  .option("--yes", "跳过确认")
  .action(runInit);

program
  .command("status")
  .description("检查本机 AI 编程工具与 LiteGate 接入状态")
  .action(runStatus);

program
  .command("models")
  .description("列出 LiteGate 全部可用模型与价格（默认按实时价格排序）")
  .option("--sort <by>", "price（默认，实时价格升序、免费在前）| name | type", "price")
  .action((opts) => { import("./commands/models.js").then((m) => m.runModels(opts.sort)); });

program
  .command("switch [model]")
  .description("一键切换 Claude Code / Codex / ZCode 的默认模型为 LiteGate 模型")
  .action((model) => { import("./commands/switch.js").then((m) => m.runSwitch(model)); });

program
  .command("rollback")
  .description("回滚 LiteGate Cli 做过的全部修改")
  .action(runRollback);

program
  .command("doctor")
  .description("诊断：工具检测 / 网络 / Key / 配置完整性")
  .action(runDoctor);

program.parseAsync(process.argv);
