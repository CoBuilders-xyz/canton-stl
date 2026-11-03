#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root on the Linux x64 GitHub runner.
sdk_version=3.5.8
if [ ! -x "$HOME/.dpm/bin/dpm" ]; then
  install_dir="$(mktemp -d)"
  trap 'rm -rf "$install_dir"' EXIT
  curl --fail --location --retry 3 \
    "https://get.digitalasset.com/install/dpm-sdk/dpm-${sdk_version}-linux-amd64.tar.gz" \
    --output "$install_dir/sdk.tar.gz"
  mkdir "$install_dir/sdk"
  tar -xzf "$install_dir/sdk.tar.gz" -C "$install_dir/sdk" --strip-components=1
  "$install_dir/sdk/bin/dpm" bootstrap "$install_dir/sdk"
fi
export PATH="$HOME/.dpm/bin:$PATH"
echo "$HOME/.dpm/bin" >> "$GITHUB_PATH"
dpm install

# The helpers select this runtime explicitly, independently of the compiler.
mkdir -p .cache/runtime
cat > .cache/runtime/daml.yaml <<'YAML'
components:
  - canton-open-source:3.5.6
YAML
(cd .cache/runtime && dpm install package)
dpm version
