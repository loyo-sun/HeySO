#!/bin/zsh
cd "${0:A:h}"
HEY_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$HEY_NODE" ]]; then
  HEY_NODE="$(command -v node)"
fi
if [[ -z "$HEY_NODE" ]]; then
  echo "请先安装 Node.js 20.19 或更高版本。"
  read
  exit 1
fi
"$HEY_NODE" server/index.mjs
