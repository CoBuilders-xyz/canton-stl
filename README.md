# STL: Sandbox Testing Library

[![Library tests](https://github.com/CoBuilders-xyz/canton-stl/actions/workflows/tests.yml/badge.svg)](https://github.com/CoBuilders-xyz/canton-stl/actions/workflows/tests.yml)

STL starts local Canton Sandboxes and provides party clients for Node.js
integration tests. Bring your own compiled DARs, ledger commands, and assertions.

STL is in beta. Install with:

```sh
npm install @cobuilders/canton-stl@beta
```

## Use

Requires Node.js >=24.10 with ESM, Java 21, DPM, and the installed
`canton-open-source:3.5.6` component. SDK bundle 3.5.8 is the tested toolchain.
See [Contributing](https://github.com/CoBuilders-xyz/canton-stl/blob/main/CONTRIBUTING.md) for toolchain setup and development commands.

```sh
# In this checkout; choose an existing output directory:
npm ci
npm pack --pack-destination /path/to/output

# In your ESM project (package.json has "type": "module"):
npm install /path/to/output/cobuilders-canton-stl-0.1.0-beta.1.tgz
```

Save this as `sandbox.test.js`, set the DAR path, and run `node --test`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { asParty, freshParties, withSandbox } from "@cobuilders/canton-stl";

test("a fresh party has an empty contract view", async () => {
  await withSandbox(async (sandbox) => {
    const { Alice } = await freshParties(sandbox, ["Alice"]);
    const alice = asParty(sandbox, Alice);
    assert.deepEqual(await alice.contracts(), []);
    // Submit your application's commands with alice.submit(commands).
  }, { dars: ["./my-app.dar"] });
});
```

## Helpers

- `startSandbox` / `withSandbox`: start and release an owned Sandbox.
- `freshParties`: allocate new parties and ledger users for each fixture.
- `asParty`: submit commands and query contracts with a fixed party context.
- `createdContracts`, `createdContractIds`, `singleCreatedContract`: inspect creates.
- `LedgerApiError`: preserve HTTP status and ledger error details.

## Beta scope

Local open Sandboxes only; authenticated provisioning and token/user-rights
enforcement are not validated. Queries support fixture-sized contract responses.
There are no static-time helpers, snapshots, or LocalNet orchestration. Process
management targets POSIX Linux/macOS; macOS validation remains pending.

The [OpenZeppelin Vault example](https://github.com/CoBuilders-xyz/canton-stl/blob/main/examples/oz-pausable-vault/README.md) demonstrates
contract creation and choices. It is optional and runs separately from library CI.

STL is licensed under [Apache-2.0](LICENSE). Copyright 2026 CoBuilders contributors.
Fetched OpenZeppelin sources retain their upstream license.
