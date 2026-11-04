import { asParty, createdContractIds, freshParties, withSandbox } from "../../src/index.ts";
import { buildExampleDar } from "./build-model.ts";

const templateId = "#stl-example:Main:Iou";
const dar = await buildExampleDar();

// One Sandbox for the whole example. The DAR is uploaded as the process starts.
// Each freshParties() call is a new run: the same hints come back as different party ids.
const result = await withSandbox(
  async (sandbox) => {
    const first = await freshParties(sandbox, ["Alice", "Bob"]);
    const second = await freshParties(sandbox, ["Alice", "Bob"]);
    const alice = asParty(sandbox, first.Alice, { tokenProvider: () => undefined });
    const bob = asParty(sandbox, first.Bob);

    const created = await alice.submit([
      {
        CreateCommand: {
          templateId,
          createArguments: {
            issuer: alice.partyId,
            owner: bob.partyId,
            amount: "10.0",
          },
        },
      },
    ]);
    const [iou] = createdContractIds(created);
    if (!iou) throw new Error(`create did not return a contract id: ${JSON.stringify(created)}`);
    const aliceAfterCreate = await alice.activeContracts();
    const bobAfterCreate = await bob.activeContracts();

    await bob.submit([
      {
        ExerciseCommand: {
          templateId,
          contractId: iou,
          choice: "Transfer",
          choiceArgument: { newOwner: alice.partyId },
        },
      },
    ]);
    // Bob is not a stakeholder of the new IOU, so his transaction only shows the archive.
    const bobAfterTransfer = await bob.activeContracts();
    const aliceAfterTransfer = await alice.activeContracts();
    const transferredIou = aliceAfterTransfer.find((id) => id !== iou);
    if (!transferredIou) throw new Error("Alice did not see the IOU created by Transfer");

    await alice.submit([
      {
        ExerciseCommand: {
          templateId,
          contractId: transferredIou,
          choice: "Settle",
          choiceArgument: {},
        },
      },
    ]);
    const aliceAfterSettle = await alice.activeContracts();

    return {
      jsonApiUrl: sandbox.jsonApiUrl,
      first,
      second,
      aliceUserId: alice.userId,
      aliceActAs: alice.actAs[0],
      bobActAs: bob.actAs[0],
      iou,
      transferredIou,
      aliceAfterCreate,
      bobAfterCreate,
      aliceAfterTransfer,
      bobAfterTransfer,
      aliceAfterSettle,
    };
  },
  { dars: [dar] },
);

console.log(`Sandbox ${result.jsonApiUrl}`);
console.log(`DAR ${dar}`);
for (const [label, parties] of [
  ["first run", result.first],
  ["second run", result.second],
] as const) {
  console.log(label);
  for (const party of Object.values(parties)) {
    console.log(`  ${party.hint}  ${party.partyId}  user ${party.userId}`);
  }
}
console.log(`Alice created ${result.iou}`);
console.log(`Bob transferred it to ${result.transferredIou}`);
console.log(`Alice settled ${result.transferredIou}`);

if (result.first.Alice.partyId === result.second.Alice.partyId) {
  throw new Error("the second run reused Alice's party id");
}
if (result.first.Bob.partyId === result.second.Bob.partyId) {
  throw new Error("the second run reused Bob's party id");
}
if (result.aliceUserId !== result.first.Alice.userId || result.aliceActAs !== result.first.Alice.partyId) {
  throw new Error("Alice's context is not her user and party");
}
if (result.bobActAs !== result.first.Bob.partyId || result.aliceActAs === result.bobActAs) {
  throw new Error("Bob's context was overwritten by Alice");
}
if (!result.aliceAfterCreate.includes(result.iou) || !result.bobAfterCreate.includes(result.iou)) {
  throw new Error("the created IOU was not visible to both parties");
}
if (!result.aliceAfterTransfer.includes(result.transferredIou) || result.bobAfterTransfer.length !== 0) {
  throw new Error(
    `Transfer left Alice with [${result.aliceAfterTransfer.join(", ")}] and Bob with [${result.bobAfterTransfer.join(", ")}]`,
  );
}
if (result.aliceAfterSettle.length !== 0) {
  throw new Error(`Alice still sees contracts after Settle: ${result.aliceAfterSettle.join(", ")}`);
}

console.log("created, transferred, and settled one IOU on one Sandbox");
