import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  asParty, createdContracts, freshParties, LedgerApiError, startSandbox,
  type PartyContext, type SandboxSession,
} from "../../src/index.ts";
import { vaultDar } from "./prepare.ts";

const moduleId = "#pausable-vault-example:OpenZeppelin.Examples.Pausable.Vault";
const templateId = `${moduleId}:Vault`;

function exercise(contractId: string, choice: string, choiceArgument: Record<string, unknown> = {}) {
  return { ExerciseCommand: { templateId, contractId, choice, choiceArgument } };
}

describe("OpenZeppelin Pausable Vault on a real Sandbox", { timeout: 180_000 }, () => {
  let sandbox: SandboxSession;
  before(async () => { sandbox = await startSandbox({ dars: [vaultDar] }); });
  after(async () => { await sandbox?.stop(); });

  async function fixture() {
    const parties = await freshParties(sandbox, ["Admin", "Owner"]);
    const admin = asParty(sandbox, parties.Admin);
    const owner = asParty(sandbox, parties.Owner);
    // Both are signatories of OZ's Vault. This example uses an open Sandbox.
    const joint = asParty(sandbox, parties.Admin, { actAs: [admin.partyId, owner.partyId] });
    const tx = await joint.submit([{ CreateCommand: {
      templateId, createArguments: { admin: admin.partyId, owner: owner.partyId, balance: "100.0", paused: false },
    } }]);
    const vault = createdContracts(tx).find((event) => event.templateId.endsWith(":Vault"));
    assert.ok(vault, "OZ Vault was created");
    return { admin, owner, vaultId: vault.contractId };
  }

  async function vaultOf(client: PartyContext) {
    const contracts = (await client.contracts()).filter((contract) => contract.templateId.endsWith(":Vault"));
    assert.equal(contracts.length, 1);
    return contracts[0]!;
  }

  it("lets the owner withdraw 40, leaving 60 and a payout of 40", async () => {
    const { owner, vaultId } = await fixture();
    await owner.submit([exercise(vaultId, "Vault_Withdraw", { amount: "40.0" })]);
    const vault = await vaultOf(owner);
    assert.equal(Number(vault.createArgument.balance), 60);
    assert.notEqual(vault.contractId, vaultId);
    const payouts = (await owner.contracts()).filter((c) => c.templateId.endsWith(":Payout"));
    assert.equal(payouts.length, 1);
    assert.equal(Number(payouts[0]!.createArgument.amount), 40);
    assert.equal(payouts[0]!.createArgument.recipient, owner.partyId);
  });

  it("rejects withdrawals while the administrator has paused the vault", async () => {
    const { admin, owner, vaultId } = await fixture();
    await admin.submit([exercise(vaultId, "Vault_Pause")]);
    const paused = await vaultOf(owner);
    assert.equal(paused.createArgument.paused, true);
    await assert.rejects(owner.submit([exercise(paused.contractId, "Vault_Withdraw", { amount: "10.0" })]), (error: unknown) => {
      assert.ok(error instanceof LedgerApiError, "expected a ledger rejection, not a transport failure");
      assert.ok(error.status >= 400 && error.status < 500);
      assert.match(JSON.stringify(error.responseBody), /openzeppelin\.com\/pausable-enforced-pause/);
      return true;
    });
    assert.equal(Number((await vaultOf(owner)).createArgument.balance), 100);
    assert.equal((await owner.contracts()).filter((c) => c.templateId.endsWith(":Payout")).length, 0);
  });

  it("allows withdrawals again after the administrator unpauses the vault", async () => {
    const { admin, owner, vaultId } = await fixture();
    await admin.submit([exercise(vaultId, "Vault_Pause")]);
    const paused = await vaultOf(admin);
    await admin.submit([exercise(paused.contractId, "Vault_Unpause")]);
    const unpaused = await vaultOf(owner);
    assert.equal(unpaused.createArgument.paused, false);
    await owner.submit([exercise(unpaused.contractId, "Vault_Withdraw", { amount: "25.0" })]);
    assert.equal(Number((await vaultOf(owner)).createArgument.balance), 75);
  });
});
