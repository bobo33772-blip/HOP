#!/bin/bash
# 클라우드 세션 시작 시 jjim-gonggu/app을 CI(.github/workflows/jjim-app.yml)와 같은 환경으로 맞춘다:
# Node 24 + package.json의 packageManager에 적힌 pnpm(corepack) + 의존성 설치.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

NODE_MAJOR=24
NODE_HOME=/opt/node24
APP_DIR="$CLAUDE_PROJECT_DIR/jjim-gonggu/app"

# Node 24가 없으면 nodejs.org에서 받아 체크섬 확인 후 설치 (있으면 건너뜀)
if ! "$NODE_HOME/bin/node" -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  version=$(curl -fsS https://nodejs.org/dist/index.json \
    | jq -r "[.[] | select(.version | startswith(\"v$NODE_MAJOR.\"))][0].version")
  tarball="node-$version-linux-x64.tar.xz"
  dl_dir=/opt/node-dl
  mkdir -p "$dl_dir"
  curl -fsSL -o "$dl_dir/$tarball" "https://nodejs.org/dist/$version/$tarball"
  (cd "$dl_dir" && curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" | grep " $tarball\$" | sha256sum -c -)
  tar -xJf "$dl_dir/$tarball" -C "$dl_dir"
  ln -sfn "$dl_dir/node-$version-linux-x64" "$NODE_HOME"
fi

export PATH="$NODE_HOME/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
echo "export PATH=\"$NODE_HOME/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
echo "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0" >> "$CLAUDE_ENV_FILE"

corepack enable

cd "$APP_DIR"
pnpm install
