# OpenZeppelin Pausable Vault

This optional integration example consumes STL from `../../src/index.ts` and uses
the original Vault from
[OpenZeppelin/canton-contracts](https://github.com/OpenZeppelin/canton-contracts/blob/1899f7a4326c9e1b6b76cb434e490e2e82331d9c/examples/pausable/vault/daml/OpenZeppelin/Examples/Pausable/Vault.daml).
The Daml source is not copied into this repository or modified. This example is
not run by root `npm test` and does not validate an installed npm package.

## Requirements and commands

Use Node.js 26.8.1, Java 21, DPM with SDK 3.5.8, and the
`canton-open-source:3.5.6` component. The manual workflow uses Linux x64. Setup
also requires `curl` and `tar`, with network access for the first source download.

Install Node dependencies once from the repository root, then run the example's
local commands. The example has no separate dependencies or lockfile:

```sh
# From the repository root:
npm ci
cd examples/oz-pausable-vault
npm test
```

`npm test` typechecks the example, obtains the pinned source archive if missing,
builds Vault, and runs all three tests against a real open Sandbox. Repeat the
same command to reuse the verified download. Missing toolchains or failed tests
fail the command; there is no separate setup step to run first.

To install the compiler and runtime using an already available DPM:

```sh
# Run from this directory; use an isolated configuration for each selection.
toolchain_config_dir="$(mktemp -d)"
printf 'sdk-version: 3.5.8\n' > "$toolchain_config_dir/daml.yaml"
(cd "$toolchain_config_dir" && dpm install)
printf 'components:\n  - canton-open-source:3.5.6\n' > "$toolchain_config_dir/daml.yaml"
(cd "$toolchain_config_dir" && dpm install package)
rm -rf "$toolchain_config_dir"
```

## Source and validation

`upstream.json` pins the official source commit and archive SHA-256. The archive
is cached by commit in this directory's ignored `.cache/` and verified on every
run. Downloads use a temporary file that is promoted only after verification;
failed downloads are discarded. A corrupt cached archive fails verification;
remove that archive and rerun `npm test` to download it again.

Each run extracts clean sources and runs one native DPM build with
`DAML_PACKAGE=examples/pausable/vault`. DPM uses upstream's `multi-package.yaml`
and declared DAR dependencies to build Vault and its Pausable dependencies.
The upstream license is included in the extracted archive. No submodule is
required. Paths are resolved relative to this directory, independently of the
shell's working directory.

The Node test suite uses STL to start Sandbox with the upstream DAR, prepare
fresh parties/users, and exercise the Vault through the Ledger API:

1. The owner withdraws 40 from a balance of 100; the new balance is 60 and a
   payout of 40 is visible to the owner.
2. The admin pauses the Vault; a withdrawal fails with OZ's specific pause error,
   leaving the balance unchanged and creating no payout.
3. The admin unpauses the Vault; the owner can withdraw again.

These tests exercise OZ's contracts and are not a replacement for OZ's original
Daml Script test suite or an endorsement by OpenZeppelin. The initial Vault
requires both signatories, so setup uses an explicit joint `actAs` client. The
Sandbox runs without authentication; the suite does not establish token
validation, user-rights enforcement, or authenticated multi-party provisioning.

The [Optional examples workflow](https://github.com/CoBuilders-xyz/canton-stl/actions/workflows/examples.yml)
is manual only: Actions → Optional examples → Run workflow (`workflow_dispatch`).
It typechecks this example, builds the pinned contracts, and runs the Vault tests
on a real open Sandbox. Automatic library CI does not run this example.

In this directory, `.reports/oz-provenance.json` records the upstream link,
commit, archive and source hashes, SDK version, and resulting DAR hash. The
manual workflow writes `.reports/oz-vault.xml` and command logs alongside it,
then uploads `.reports/` as `optional-oz-evidence`.
