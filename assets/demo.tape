Output assets/demo.gif

# 自带沙箱：以下命令一律跑在隔离 HOME（/tmp/litegate-demo）下，
# 录出的 gif 只显示沙箱路径，不含真实用户目录（避免 /Users/<你> 泄漏）。
# Hide 段会先在沙箱里真实 init 一次种入演示配置，让 status 显示「已接入 ✓」。
# Shell 用 bash 而非 zsh：GitHub Actions runner 不预装 zsh，bash 处处可用。
Set Shell "bash"
Set FontSize 19
Set Width 1150
Set Height 800
Set Padding 28
Set Theme "Catppuccin Mocha"
Set TypingSpeed 0.02

Hide
Type "rm -rf /tmp/litegate-demo"
Enter
Type "export HOME=/tmp/litegate-demo"
Enter
Type "mkdir -p $HOME/.claude $HOME/.codex $HOME/.zcode $HOME/.minimax"
Enter
Type "litegate init --key sk-lcc-demo0000000000000000000000 --tools claude-code,codex,zcode,minimax-code --yes"
Enter
Sleep 5s
Type "export PS1='❯ '"
Enter
Type "clear"
Enter
Show

Type "litegate status"
Enter
Sleep 3s

Type "clear" Enter
Type "litegate models"
Enter
Sleep 3.5s

# 已接入状态下重跑 init：适配器均可优雅增量（codex 标记段幂等、claude-code 仅同步 modelPicker）。
# 历史注：npm 旧版（≤0.6.x）codex 重跑曾以 TOML 重复键报错收尾，现已有 E2E 用例锁住该语义。
Type "clear" Enter
Type "litegate init --key sk-lcc-demo0000000000000000000000 --tools claude-code --dry-run --yes"
Enter
Sleep 4s
