import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as stl from "@cobuilders/stl";

assert.equal(
  fileURLToPath(import.meta.resolve("@cobuilders/stl")),
  path.resolve("node_modules/@cobuilders/stl/dist/index.js"),
);
assert.deepEqual(Object.keys(stl).sort(), [
  "LedgerApiError", "asParty", "createdContractIds", "createdContracts",
  "freshParties", "singleCreatedContract", "startSandbox", "withSandbox",
].sort());
for (const exported of Object.values(stl)) assert.equal(typeof exported, "function");

const created = {
  contractId: "contract-1",
  templateId: "consumer-package:Example:Asset",
  createArgument: { owner: "Alice::namespace", contractId: "payload-reference" },
};
const transaction = { transaction: { events: [{ CreatedEvent: { value: created } }] } };
assert.deepEqual(stl.createdContractIds(transaction), ["contract-1"]);
assert.deepEqual(stl.createdContracts(transaction), [created]);
assert.deepEqual(stl.singleCreatedContract(transaction), created);
console.log(`Plain JS consumer passed (${process.version}); TypeScript stripping disabled.`);
