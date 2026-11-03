# Canton test helpers

[![Sandbox examples](https://github.com/CoBuilders-xyz/canton-test-helpers/actions/workflows/tests.yml/badge.svg)](https://github.com/CoBuilders-xyz/canton-test-helpers/actions/workflows/tests.yml)

Private prototype of reusable Canton Sandbox setup for Node.js integration tests.
The library lives in `src/`; application contracts, fixtures, and assertions live
in `examples/`. This is based on the Network Helpers PoC in `canton-research`.
The original research repository is unchanged.

## Examples

- [IOU](examples/iou/README.md): the original model, fixtures, Mocha/Chai tests,
  and Node tests.
- [OpenZeppelin Pausable Vault](examples/oz-pausable-vault/README.md): Node tests
  against OpenZeppelin's unmodified Vault, downloaded from the official repository
  at a pinned commit and compiled locally. No submodules.

## Run

Requires Node.js 26.8.1, Java 21, DPM with SDK 3.5.8, and the
`canton-open-source:3.5.6` component. The current process management supports
Linux and macOS; CI verifies Linux x64.

```sh
npm ci
dpm install
# Install the runtime selected by the helpers:
mkdir -p .cache/runtime
printf 'components:\n  - canton-open-source:3.5.6\n' > .cache/runtime/daml.yaml
(cd .cache/runtime && dpm install package)
npm test
```

Individual commands:

```sh
npm run test:unit
npm run test:iou
npm run test:oz
```

## CI evidence

[GitHub Actions](https://github.com/CoBuilders-xyz/canton-test-helpers/actions/workflows/tests.yml)
runs the helper tests and both examples against real local Sandbox processes.
Missing toolchains or failed startup fail the job; integration tests are not
silently skipped. Each run identifies the source revision being tested.
The `sandbox-test-evidence` artifact includes the OZ source provenance and Vault
JUnit results. Repository access is required to see private workflow runs.

## Prototype boundaries

Authentication is disabled in the examples. Contract-controller rejection is
tested, but token enforcement and ledger-user rights are not established here.
There are no static-time helpers, snapshots, or LocalNet orchestration. Contract
queries support the small-fixture response shape used by these examples.

`asParty()` creates a fixed client for one existing user and party. An optional
`actAs` array supports joint submissions, such as creating a Vault signed by both
admin and owner; it does not grant that user any additional rights. Authenticated
multi-party provisioning remains future work.

`package.json` is private and the project is not published to npm. OpenZeppelin
dependencies retain their upstream licensing; this repository does not relicense
them. Own code is not offered under an open-source license at this stage.
