# Install orchestra

After the first push, install the generated build from the `skillz-build` branch.

- Claude: `claude plugin marketplace add dylanOshima/orchestra@skillz-build` then `claude plugin install orchestra@orchestra-skillz`
- Codex: `codex plugin marketplace add dylanOshima/orchestra --ref skillz-build` then `codex plugin add orchestra@orchestra-skillz`.
- OpenCode: run `mkdir -p "$HOME/.config/opencode/plugins" && git clone --depth 1 --branch skillz-build https://github.com/dylanOshima/orchestra.git "$HOME/.config/opencode/plugins/orchestra"`, then `opencode plugin "file://$HOME/.config/opencode/plugins/orchestra" --global`. OpenCode's Git-package installer currently fails for this class of dependency; the checked-out generated branch is its supported file-plugin input.
