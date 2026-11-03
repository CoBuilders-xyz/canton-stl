# OpenZeppelin Pausable Vault

This example uses the original Vault from
[OpenZeppelin/canton-contracts](https://github.com/OpenZeppelin/canton-contracts/blob/1899f7a4326c9e1b6b76cb434e490e2e82331d9c/examples/pausable/vault/daml/OpenZeppelin/Examples/Pausable/Vault.daml).
The Daml source is not copied into this repository or modified.

`upstream.json` pins the official source commit and archive SHA-256. `npm run
setup:oz` downloads and verifies that archive, extracts it into ignored `.cache/`,
and builds only the Pausable interface, implementation, and Vault example. The
upstream license is included in the extracted archive. No submodule is required.

The JavaScript test suite uses our helpers to start Sandbox with the upstream
DAR, prepare fresh parties/users, and exercise the Vault through the Ledger API:

1. The owner withdraws 40 from a balance of 100; the new balance is 60 and a
   payout of 40 is visible to the owner.
2. The admin pauses the Vault; a withdrawal fails with OZ's specific pause error,
   leaving the balance unchanged and creating no payout.
3. The admin unpauses the Vault; the owner can withdraw again.

```sh
# From the repository root:
npm run test:oz
```

These are new Node integration tests of OZ's contracts, not a replacement for
OZ's original Daml Script test suite and not an endorsement by OpenZeppelin.
The initial Vault requires both signatories, so setup uses an explicit joint
`actAs` client. This prototype runs with authentication disabled.

CI compiles the same pinned source and runs these tests on a real Sandbox.
`.reports/oz-provenance.json` records the upstream link, commit, archive and
source hashes, compiler version, and resulting DAR hash. The workflow artifact
also contains JUnit results. A reader can follow the upstream link and reproduce
the build; no locally rewritten substitute contract is used.
