import { asParty, freshParties, singleCreatedContract, type PartyContext, type Sandbox } from "../../../../src/index.ts";

export const templateId = "#stl-example:Main:Iou";
export const createIou = (issuer: string, owner: string, amount = "10.0") => ({
  CreateCommand: { templateId, createArguments: { issuer, owner, amount } },
});
export const exerciseIou = (contractId: string, choice: string, choiceArgument: Record<string, unknown> = {}) => ({
  ExerciseCommand: { templateId, contractId, choice, choiceArgument },
});

/** A setup fixture, not a cached snapshot: every call creates new parties and contracts. */
export async function setupIou(sandbox: Sandbox) {
  const parties = await freshParties(sandbox, ["Alice", "Bob", "Charlie"]);
  const alice = asParty(sandbox, parties.Alice);
  const bob = asParty(sandbox, parties.Bob);
  const charlie = asParty(sandbox, parties.Charlie);
  const iou = singleCreatedContract(await alice.submit([createIou(alice.partyId, bob.partyId)]));
  return { parties, alice, bob, charlie, iou };
}

export type IouFixture = Awaited<ReturnType<typeof setupIou>>;

export async function contract(party: PartyContext, contractId: string) {
  const matches = (await party.contracts()).filter((c) => c.contractId === contractId);
  if (matches.length !== 1) throw new Error(`Expected exactly one visible contract ${contractId}; found ${matches.length}`);
  return matches[0]!;
}
