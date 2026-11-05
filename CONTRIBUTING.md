# Contributing

Install Node.js >=24.10, then run from the repository root:

```sh
npm ci
npm test
npm run test:package
```

`npm test` runs typechecking and unit regressions. `test:package` builds, packs,
installs, and checks JavaScript and TypeScript consumers without DPM or Java.

## Build

```sh
npm run build
npm pack --pack-destination /path/to/existing-output-directory
```

Builds clean `dist/` and emit ESM JavaScript and declarations. `npm pack` rebuilds
through `prepack`; generated output stays untracked. Packing does not publish.

## Real Sandbox tests

Install Java 21 and [DPM](https://docs.canton.network/sdks-tools/cli-tools/dpm#installation),
with their binaries on `PATH` and `JAVA_HOME` pointing to Java 21. Set `DPM_HOME`
before installing if you want an isolated toolchain directory.

Install the pinned SDK bundle and Sandbox component using temporary configs:

```sh
toolchain_config_dir="$(mktemp -d)"
printf 'sdk-version: 3.5.8\n' > "$toolchain_config_dir/daml.yaml"
(cd "$toolchain_config_dir" && dpm install)
printf 'components:\n  - canton-open-source:3.5.6\n' > "$toolchain_config_dir/daml.yaml"
(cd "$toolchain_config_dir" && dpm install package)
rm -rf "$toolchain_config_dir"

npm run test:integration
```

The integration suite builds a minimal fixture DAR and tests the installed
package against real open Sandboxes: lifecycle, fresh parties/users, contract
submissions, and party filters. Missing tools or failed assertions fail the run.

## CI and examples

[Library tests](https://github.com/CoBuilders-xyz/canton-stl/actions/workflows/tests.yml)
runs all three test commands on Linux with Node 24.10.0 and 26.8.1.
[Optional examples](https://github.com/CoBuilders-xyz/canton-stl/actions/workflows/examples.yml)
is manual only. See the [OZ example](examples/oz-pausable-vault/README.md) for its
setup and commands. Library checks do not download or build OZ.
