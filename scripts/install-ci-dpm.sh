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
# The root no longer contains an application Daml workspace.
sdk_config_dir="$(mktemp -d)"
printf 'sdk-version: %s\n' "$sdk_version" > "$sdk_config_dir/daml.yaml"
(cd "$sdk_config_dir" && dpm install)
rm -rf "$sdk_config_dir"

# The helpers select this runtime explicitly, independently of the compiler.
# Keep this outside the workspace: otherwise DPM inherits its SDK bundle and
# rejects the runtime's explicit component selection.
sandbox_config_dir="$(mktemp -d)"
cat > "$sandbox_config_dir/daml.yaml" <<'YAML'
components:
  - canton-open-source:3.5.6
YAML
(cd "$sandbox_config_dir" && dpm install package)
rm -rf "$sandbox_config_dir"
dpm version
