import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  asParty, createdContractIds, createdContracts, freshParties,
  singleCreatedContract, startSandbox, withSandbox,
} from "@cobuilders/stl";

assert.equal(fileURLToPath(import.meta.resolve("@cobuilders/stl")),
  path.resolve("node_modules/@cobuilders/stl/dist/index.js"));
assert.ok(process.env.STL_TEST_DAR, "Run through npm run test:integration to build the fixture DAR");
const options = { dars: [process.env.STL_TEST_DAR], cantonVersion: "3.5.6" };

async function ledgerGet(sandbox, route) {
  const response = await fetch(`${sandbox.jsonApiUrl}${route}`, { signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function assertAvailable(sandbox) {
  assert.equal(typeof (await ledgerGet(sandbox, "/v2/version")).version, "string");
  const end = await ledgerGet(sandbox, "/v2/state/ledger-end");
  assert.ok(end.offset !== undefined && end.offset !== null);
  await access(sandbox.portFile);
}

function ownedPids(sandbox) {
  const result = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  // Match only this session's unique port-file argument, never a shared process name.
  return result.stdout.split("\n").filter((row) => row.includes(sandbox.portFile))
    .map((row) => Number(row.trim().split(/\s+/, 1)[0]));
}

async function assertReleased(sandbox) {
  await assert.rejects(fetch(`${sandbox.jsonApiUrl}/v2/version`, { signal: AbortSignal.timeout(1000) }),
    (error) => error.cause?.code === "ECONNREFUSED");
  for (const port of [sandbox.ledgerApiPort, sandbox.adminApiPort, sandbox.jsonApiPort]) {
    const server = net.createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
    } finally {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
  }
  assert.deepEqual(ownedPids(sandbox), [], "owned launcher/JVM must exit");
  await assert.rejects(access(sandbox.portFile), { code: "ENOENT" });
}

async function markerFixture(sandbox, label) {
  const parties = await freshParties(sandbox, ["Owner", "Reader", "Unrelated"]);
  const owner = asParty(sandbox, parties.Owner);
  const reader = asParty(sandbox, parties.Reader);
  const unrelated = asParty(sandbox, parties.Unrelated);
  assert.deepEqual(await owner.contracts(), []);
  const payload = { owner: owner.partyId, reader: reader.partyId, label };
  const transaction = await owner.submit([{ CreateCommand: {
    templateId: "#stl-test-fixture:Fixture:Marker", createArguments: payload,
  } }]);
  const created = singleCreatedContract(transaction);
  assert.deepEqual(createdContracts(transaction), [created]);
  assert.deepEqual(createdContractIds(transaction), [created.contractId]);
  assert.ok(created.templateId.endsWith(":Fixture:Marker"));
  assert.deepEqual(created.createArgument, payload);
  return { parties, owner, reader, unrelated, created };
}

test("startSandbox readies a real ledger; stop releases the owned process and ports", { timeout: 180_000 }, async (t) => {
  const sandbox = await startSandbox(options);
  t.after(async () => {
    await Promise.all([sandbox.stop(), sandbox.stop()]);
    await sandbox.stop();
    await assertReleased(sandbox);
  });
  await assertAvailable(sandbox);
  assert.ok(sandbox.startupMs > 0);
  assert.ok(ownedPids(sandbox).length > 0, "observe the owned launcher/JVM before shutdown");

  await t.test("freshParties persists distinct parties/users for repeated names, including parallel calls", async () => {
    const first = await freshParties(sandbox, ["Alice", "Bob"]);
    const next = await freshParties(sandbox, ["Alice", "Bob"]);
    const parallel = await Promise.all(Array.from({ length: 3 }, () => freshParties(sandbox, ["Alice", "Bob"])));
    const all = [first, next, ...parallel].flatMap(Object.values);
    assert.equal(new Set(all.map((party) => party.partyId)).size, all.length);
    assert.equal(new Set(all.map((party) => party.userId)).size, all.length);
    assert.equal(new Set(all.map((party) => party.allocatedHint)).size, all.length);
    for (const party of all) {
      assert.ok(party.partyId.startsWith(`${party.allocatedHint}::`));
      assert.ok(party.allocatedHint.startsWith(`${party.hint}-`));
      const details = await ledgerGet(sandbox, `/v2/parties/${encodeURIComponent(party.partyId)}`);
      assert.ok(details.partyDetails.some((entry) => entry.party === party.partyId && entry.isLocal));
      const { user } = await ledgerGet(sandbox, `/v2/users/${encodeURIComponent(party.userId)}`);
      assert.equal(user.id, party.userId);
      assert.equal(user.primaryParty, party.partyId);
      assert.equal(user.isDeactivated, false);
    }
  });

  await t.test("created-event helpers and party filters keep independent fixture views", async () => {
    const first = await markerFixture(sandbox, "first");
    const next = await markerFixture(sandbox, "next");
    assert.notEqual(first.owner.partyId, next.owner.partyId);
    assert.notEqual(first.owner.userId, next.owner.userId);
    assert.notEqual(first.created.contractId, next.created.contractId);
    for (const fixture of [first, next]) {
      assert.deepEqual(await fixture.owner.contracts(), [fixture.created]);
      assert.deepEqual(await fixture.reader.contracts(), [fixture.created]);
      assert.deepEqual(await fixture.owner.activeContracts(), [fixture.created.contractId]);
      assert.deepEqual(await fixture.reader.activeContracts(), [fixture.created.contractId]);
      assert.deepEqual(await fixture.unrelated.contracts(), []);
    }
    // These are open-ledger party filters, not authenticated identity isolation.
  });
});

test("withSandbox releases resources after a successful callback and preserves its result", { timeout: 180_000 }, async (t) => {
  let owned;
  t.after(async () => { await owned?.stop(); });
  const result = await withSandbox(async (sandbox) => {
    owned = sandbox;
    await assertAvailable(sandbox);
    assert.ok(ownedPids(sandbox).length > 0);
    return "callback-result";
  }, options);
  assert.equal(result, "callback-result");
  await assertReleased(owned);
  await owned.stop();
});

test("withSandbox releases resources when the callback throws and preserves the error", { timeout: 180_000 }, async (t) => {
  let owned;
  t.after(async () => { await owned?.stop(); });
  const intended = new Error("intentional callback failure");
  await assert.rejects(withSandbox(async (sandbox) => {
    owned = sandbox;
    await assertAvailable(sandbox);
    assert.ok(ownedPids(sandbox).length > 0);
    throw intended;
  }, options), (error) => error === intended);
  await assertReleased(owned);
  await owned.stop();
});
