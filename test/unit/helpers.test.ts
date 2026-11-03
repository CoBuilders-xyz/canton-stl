import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { asParty, createdContractIds, singleCreatedContract, startSandbox, LedgerApiError } from "../../src/index.ts";
import { ledgerJson } from "../../src/http.ts";

const sandbox = { jsonApiUrl: "http://127.0.0.1:1", ledgerApiPort: 1, adminApiPort: 2, jsonApiPort: 3, portFile: "unused" };
const party = { hint: "Alice", allocatedHint: "Alice-test", partyId: "Alice-test::namespace", userId: "Alice-test" };
const event = { contractId: "real", templateId: "pkg:Main:Iou", createArgument: { contractId: "payload-only" } };

it("extracts event IDs without mistaking a payload reference for a created contract", () => {
  assert.deepEqual(createdContractIds({ transaction: { events: [{ CreatedEvent: event }] } }), ["real"]);
});

it("refuses ambiguous or malformed transaction results", () => {
  assert.throws(() => singleCreatedContract({ transaction: { events: [] } }), /received 0/);
  assert.throws(() => singleCreatedContract({ transaction: { events: [{ CreatedEvent: event }, { CreatedEvent: event }] } }), /received 2/);
  assert.throws(() => createdContractIds({ error: "unexpected response" }), /Expected a transaction/);
});

it("does not turn an unexpected ACS response into a passing empty-ledger assertion", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(JSON.stringify(
    url.endsWith("ledger-end") ? { offset: 1 } : { error: "wrong schema" },
  )));
  await assert.rejects(asParty(sandbox, party).activeContracts(), /Expected an active-contract response array/);
});

it("refreshes tokens on each submission and preserves independent immutable contexts", async (t) => {
  const sent: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    sent.push(init);
    return new Response(JSON.stringify({ transaction: { events: [] } }));
  });
  let count = 0;
  const alice = asParty(sandbox, party, { tokenProvider: () => `token-${++count}` });
  const bob = asParty(sandbox, { ...party, partyId: "Bob::namespace", userId: "Bob" });
  await alice.submit([]);
  await alice.submit([]);
  assert.equal((sent[0]!.headers as Record<string, string>).authorization, "Bearer token-1");
  assert.equal((sent[1]!.headers as Record<string, string>).authorization, "Bearer token-2");
  assert.deepEqual(alice.actAs, [party.partyId]);
  assert.deepEqual(bob.actAs, ["Bob::namespace"]);
  assert.ok(Object.isFrozen(alice) && Object.isFrozen(alice.actAs));
});

it("preserves HTTP error status and body for specific rejection assertions", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('{"code":"PERMISSION_DENIED"}', { status: 403 }));
  await assert.rejects(ledgerJson(sandbox.jsonApiUrl, "/test"), (error: unknown) => {
    assert.ok(error instanceof LedgerApiError);
    assert.equal(error.status, 403);
    assert.deepEqual(error.responseBody, { code: "PERMISSION_DENIED" });
    return true;
  });
});

it("keeps a joint submitting client's parties fixed without changing either individual client", () => {
  const actors = [party.partyId, "Bob::namespace"];
  const joint = asParty(sandbox, party, { actAs: actors });
  actors.pop();
  assert.deepEqual(joint.submission([]).commands.actAs, [party.partyId, "Bob::namespace"]);
  assert.deepEqual(asParty(sandbox, party).actAs, [party.partyId]);
  assert.ok(Object.isFrozen(joint.actAs));
});

it("bounds a hung HTTP request", async () => {
  const server = createServer(() => { /* Deliberately never reply. */ });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await assert.rejects(ledgerJson(`http://127.0.0.1:${address.port}`, "/hung", { timeoutMs: 50 }), { name: "TimeoutError" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("reports a missing Sandbox executable instead of an unhandled child error", async () => {
  await assert.rejects(startSandbox({ command: "/nonexistent/network-helpers-dpm", readyTimeoutMs: 1000 }), /ENOENT/);
});

it("reports early launcher exit without waiting for the full readiness timeout", async () => {
  await assert.rejects(startSandbox({ command: "/usr/bin/false", readyTimeoutMs: 1000 }), /exited before readiness/);
});
