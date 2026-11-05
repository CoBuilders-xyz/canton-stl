import {
  asParty, createdContractIds, createdContracts, freshParties, LedgerApiError,
  singleCreatedContract, startSandbox, withSandbox,
  type CreatedContract, type FreshParty, type PartyContext, type Sandbox,
  type SandboxOptions, type SandboxSession, type TokenProvider,
} from "@cobuilders/canton-stl";

const sandbox: Sandbox = {
  jsonApiUrl: "http://127.0.0.1:1", ledgerApiPort: 1, adminApiPort: 2,
  jsonApiPort: 3, portFile: "unused",
};
const party: FreshParty = {
  hint: "Alice", allocatedHint: "Alice-run", partyId: "Alice-run::namespace", userId: "Alice-run",
};
const options: SandboxOptions = { dars: ["consumer.dar"], cantonVersion: "3.5.6" };
const tokenProvider: TokenProvider = async () => undefined;
const client: PartyContext = asParty(sandbox, party, { tokenProvider, actAs: [party.partyId] });
const contracts: Promise<CreatedContract[]> = client.contracts();
const ids: string[] = createdContractIds({ transaction: { events: [] } });
const events: CreatedContract[] = createdContracts({ transaction: { events: [] } });
const event: CreatedContract = singleCreatedContract({ transaction: { events: [] } });
const session: Promise<SandboxSession> = startSandbox(options);
const scoped: Promise<string> = withSandbox(async (running) => running.jsonApiUrl, options);
const error = new LedgerApiError("POST", "/example", 400, { reason: "fixture" });
const status: number = error.status;

freshParties(sandbox, ["Alice", "Bob"]).then((parties) => {
  const alice: FreshParty = parties.Alice;
  // @ts-expect-error The inferred party names must not widen to any.
  parties.Charlie;
});
// @ts-expect-error Contract IDs are strings, not any.
event.contractId = 123;
// @ts-expect-error DAR paths must be strings.
startSandbox({ dars: [123] });
