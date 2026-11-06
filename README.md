# STL: Sandbox Testing Library

STL runs local Canton Sandboxes for Node.js integration tests. Load your compiled
Daml archives (DARs), create fresh parties, and use their clients to submit commands
and query contracts. STL is in beta; the published package is `@cobuilders/canton-stl`.

## Requirements

- Node.js >=24.10.0 with ES modules.
- Java 21, with `java` on `PATH` and `JAVA_HOME` set.
- [DPM](https://docs.canton.network/sdks-tools/cli-tools/dpm#installation) on `PATH`,
  with the `canton-open-source:3.5.6` component installed. Tested with DPM 1.0.21.
- Your application's compiled DAR. SDK bundle 3.5.8 is the tested compilation toolchain.

## Run a test in your application

From your application's directory:

```sh
npm install @cobuilders/canton-stl@beta
```

Use your application's compiled DAR, for example `.daml/dist/my-app-0.0.1.dar`.
Replace that path below with your file. Save the code as `sandbox.test.mjs`;
`.mjs` makes this test an ES module without changing your application's module type.

```js
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { asParty, freshParties, startSandbox } from "@cobuilders/canton-stl";

describe("my application on Sandbox", { timeout: 180_000 }, () => {
  let sandbox;

  before(async () => {
    sandbox = await startSandbox({
      dars: ["./.daml/dist/my-app-0.0.1.dar"],
      cantonVersion: "3.5.6",
    });
  });
  after(async () => { await sandbox?.stop(); });

  it("a fresh party has an empty contract view", async () => {
    const { Alice } = await freshParties(sandbox, ["Alice"]);
    const alice = asParty(sandbox, Alice);
    assert.deepEqual(await alice.contracts(), []);
  });
});
```

Run from the same application directory:

```sh
node --test sandbox.test.mjs
```

## Helpers and beta scope

- `startSandbox` / `withSandbox`: start and release an owned Sandbox.
- `freshParties` / `asParty`: provision fixture parties/users and submit/query as a party.
- `createdContracts`, `createdContractIds`, `singleCreatedContract`: inspect created events.
- `LedgerApiError`: retain HTTP status and ledger error details.

Support is for local open Sandboxes and fixture-sized contract queries.
Authenticated provisioning and token/user-rights enforcement are not validated.
Static-time helpers, snapshots and LocalNet orchestration are absent. Process
management targets POSIX Linux/macOS; validation has run on Linux, not macOS.

Optional, with repository access: [OZ Vault creation/choice example](https://github.com/CoBuilders-xyz/canton-stl/blob/main/examples/oz-pausable-vault/README.md)
and [contributor build/test guide](https://github.com/CoBuilders-xyz/canton-stl/blob/main/CONTRIBUTING.md).

[Apache-2.0](LICENSE). Copyright 2026 CoBuilders contributors.
