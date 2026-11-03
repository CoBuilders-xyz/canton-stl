import { before, after, beforeEach, describe, it } from "mocha";
import { expect } from "chai";
import { exampleDar } from "../../build-model.ts";
import { LedgerApiError, startSandbox, type SandboxSession } from "../../../../src/index.ts";
import { contract, createIou, exerciseIou, setupIou, type IouFixture } from "../support/iou.ts";

describe("IOU on a real Canton Sandbox (Mocha + Chai)", function () {
  let sandbox: SandboxSession;
  let f: IouFixture;
  before(async () => { sandbox = await startSandbox({ dars: [exampleDar] }); });
  after(async () => { await sandbox?.stop(); });
  beforeEach(async () => { f = await setupIou(sandbox); });

  it("creates the exact payload, visible to issuer and owner but not an unrelated party", async () => {
    expect((await contract(f.alice, f.iou.contractId)).createArgument).to.deep.equal({
      issuer: f.alice.partyId, owner: f.bob.partyId, amount: "10.0000000000",
    });
    expect(await f.bob.activeContracts()).to.deep.equal([f.iou.contractId]);
    expect(await f.charlie.activeContracts()).to.deep.equal([]);
  });

  it("transfers ownership, preserves issuer and amount, and archives the original", async () => {
    await f.bob.submit([exerciseIou(f.iou.contractId, "Transfer", { newOwner: f.charlie.partyId })]);
    const transferred = await f.charlie.contracts();
    expect(transferred).to.have.length(1);
    expect(transferred[0]!.contractId).not.to.equal(f.iou.contractId);
    expect(transferred[0]!.createArgument).to.deep.equal({
      issuer: f.alice.partyId, owner: f.charlie.partyId, amount: "10.0000000000",
    });
    expect(await f.bob.activeContracts()).to.deep.equal([]);
    expect(await f.alice.activeContracts()).to.deep.equal([transferred[0]!.contractId]);
  });

  it("lets the issuer settle without owner consent (the current model policy)", async () => {
    await f.alice.submit([exerciseIou(f.iou.contractId, "Settle")]);
    expect(await f.alice.activeContracts()).to.deep.equal([]);
    expect(await f.bob.activeContracts()).to.deep.equal([]);
  });

  for (const amount of ["0.0", "-1.0"]) {
    it(`rejects amount ${amount} without changing existing contracts`, async () => {
      await rejectsLedger(() => f.alice.submit([createIou(f.alice.partyId, f.bob.partyId, amount)]), /precondition|ensure/i);
      expect(await f.alice.activeContracts()).to.deep.equal([f.iou.contractId]);
    });
  }

  it("rejects creation without the issuer as a signatory", async () => {
    await rejectsLedger(() => f.bob.submit([createIou(f.alice.partyId, f.bob.partyId)]), /authoriz|signator/i);
    expect(await f.alice.activeContracts()).to.deep.equal([f.iou.contractId]);
  });

  it("rejects transfer by the issuer when the owner is a different party", async () => {
    await rejectsLedger(() => f.alice.submit([exerciseIou(f.iou.contractId, "Transfer", { newOwner: f.charlie.partyId })]), /authoriz|controller/i);
    expect(await f.bob.activeContracts()).to.deep.equal([f.iou.contractId]);
  });

  it("rejects settlement by the owner", async () => {
    await rejectsLedger(() => f.bob.submit([exerciseIou(f.iou.contractId, "Settle")]), /authoriz|controller/i);
    expect(await f.bob.activeContracts()).to.deep.equal([f.iou.contractId]);
  });

  it("rejects a second exercise of an archived contract", async () => {
    await f.alice.submit([exerciseIou(f.iou.contractId, "Settle")]);
    await rejectsLedger(() => f.alice.submit([exerciseIou(f.iou.contractId, "Settle")]), /not.found|not.active|archived/i);
  });

  it("creates a fresh fixture without rewinding or sharing the previous fixture", async () => {
    const other = await setupIou(sandbox);
    expect(other.alice.partyId).not.to.equal(f.alice.partyId);
    expect(other.alice.userId).not.to.equal(f.alice.userId);
    expect(other.iou.contractId).not.to.equal(f.iou.contractId);
    await f.alice.submit([exerciseIou(f.iou.contractId, "Settle")]);
    expect(await f.alice.activeContracts()).to.deep.equal([]);
    expect(await other.alice.activeContracts()).to.deep.equal([other.iou.contractId]);
    expect(f.alice.actAs).to.deep.equal([f.parties.Alice.partyId]);
    expect(f.bob.actAs).to.deep.equal([f.parties.Bob.partyId]);
  });
});

async function rejectsLedger(action: () => Promise<unknown>, reason: RegExp) {
  let failure: unknown;
  try { await action(); } catch (error) { failure = error; }
  expect(failure, "must be a Ledger API rejection, not a transport failure").to.be.instanceOf(LedgerApiError);
  const error = failure as LedgerApiError;
  expect(error.status).to.be.within(400, 499);
  expect(JSON.stringify(error.responseBody)).to.match(reason);
}
