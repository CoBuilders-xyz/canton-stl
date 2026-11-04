import { randomUUID } from "node:crypto";
import { ledgerJson } from "./http.ts";
import type { FreshParty } from "./parties.ts";
import type { Sandbox } from "./sandbox.ts";

/** Called on every request. Return a new bearer token when the previous one expired. */
export type TokenProvider = () => string | undefined | Promise<string | undefined>;

/**
 * A Ledger API view with fixed submitters. It does not change any other context, and it
 * does not grant rights the user does not already have.
 */
export type PartyContext = {
  readonly jsonApiUrl: string;
  readonly userId: string;
  readonly partyId: string;
  readonly actAs: readonly string[];
  readonly readAs: readonly string[];
  readonly tokenProvider: TokenProvider;
  /** Authorization header for this party, omitted when the provider returns no token. */
  headers(): Promise<Record<string, string>>;
  /** Active contracts visible through this party's read filter. */
  activeContracts(): Promise<string[]>;
  /** Created-event payloads at one ledger offset, for assertions on actual contract data. */
  contracts(): Promise<CreatedContract[]>;
  /** Command body an application client would submit as this party. */
  submission(commands: readonly unknown[]): { commands: Record<string, unknown> };
  /** Submit commands as this party and return the transaction. */
  submit(commands: readonly unknown[]): Promise<unknown>;
};

const openSandbox: TokenProvider = () => undefined;

export function asParty(
  sandbox: Sandbox,
  party: FreshParty,
  options?: { tokenProvider?: TokenProvider; actAs?: readonly string[] },
): PartyContext {
  const actAs = Object.freeze([...(options?.actAs ?? [party.partyId])]);
  const readAs = Object.freeze([party.partyId]);
  const tokenProvider = options?.tokenProvider ?? openSandbox;
  const context: PartyContext = {
    jsonApiUrl: sandbox.jsonApiUrl,
    userId: party.userId,
    partyId: party.partyId,
    actAs,
    readAs,
    tokenProvider,
    headers() {
      return authorizationHeaders(tokenProvider);
    },
    activeContracts() {
      return readActiveContracts(context).then((contracts) => contracts.map((c) => c.contractId));
    },
    contracts() { return readActiveContracts(context); },
    submission(commands) {
      return {
        commands: {
          commandId: `stl-${randomUUID()}`,
          userId: context.userId,
          actAs: [...actAs],
          readAs: [...readAs],
          commands: [...commands],
        },
      };
    },
    submit(commands) {
      return submitCommands(context, commands);
    },
  };
  return Object.freeze(context);
}

async function submitCommands(party: PartyContext, commands: readonly unknown[]): Promise<unknown> {
  return ledgerJson(party.jsonApiUrl, "/v2/commands/submit-and-wait-for-transaction", {
    method: "POST",
    headers: await party.headers(),
    body: party.submission(commands),
  });
}

/** Contract ids of creates in a submit-and-wait-for-transaction response. */
export function createdContractIds(transaction: unknown): string[] {
  return createdContracts(transaction).map((event) => event.contractId);
}

export type CreatedContract = {
  contractId: string;
  templateId: string;
  createArgument: Record<string, unknown>;
};

/** Inspect event envelopes only: a payload field named contractId is not another create. */
export function createdContracts(response: unknown): CreatedContract[] {
  const transaction = object(object(response)?.transaction);
  if (!transaction || !Array.isArray(transaction.events)) throw new Error("Expected a transaction with events");
  return transaction.events.flatMap((event: unknown) => {
    const created = object(event)?.CreatedEvent;
    if (!created) return [];
    return [parseCreated(object(created)?.value ?? created)];
  });
}

/** Avoid silently selecting the first contract from a multi-create transaction. */
export function singleCreatedContract(response: unknown): CreatedContract {
  const contracts = createdContracts(response);
  if (contracts.length !== 1) throw new Error(`Expected one visible created contract, received ${contracts.length}`);
  return contracts[0]!;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseCreated(value: unknown): CreatedContract {
  const event = object(value);
  if (!event || typeof event.contractId !== "string" || typeof event.templateId !== "string" || !object(event.createArgument)) {
    throw new Error("Malformed created event in Ledger API response");
  }
  return { contractId: event.contractId, templateId: event.templateId, createArgument: event.createArgument as Record<string, unknown> };
}

async function authorizationHeaders(tokenProvider: TokenProvider): Promise<Record<string, string>> {
  const token = await tokenProvider();
  if (!token) return {};
  return { authorization: `Bearer ${token}` };
}

async function readActiveContracts(party: PartyContext): Promise<CreatedContract[]> {
  const headers = await party.headers();
  const end = await ledgerJson<{ offset?: string | number }>(party.jsonApiUrl, "/v2/state/ledger-end", {
    headers,
  });
  if (end.offset === undefined || end.offset === null || `${end.offset}` === "") {
    throw new Error("ledger end returned no offset");
  }
  const body = await ledgerJson<unknown>(party.jsonApiUrl, "/v2/state/active-contracts", {
    method: "POST",
    headers,
    body: {
      filter: {
        filtersByParty: {
          [party.partyId]: {
            cumulative: [
              {
                identifierFilter: {
                  WildcardFilter: { value: { includeCreatedEventBlob: false } },
                },
              },
            ],
          },
        },
      },
      verbose: false,
      activeAtOffset: String(end.offset),
    },
  });
  if (!Array.isArray(body)) throw new Error("Expected an active-contract response array");
  return body.flatMap((row: unknown) => {
    const entry = object(object(row)?.contractEntry);
    const active = object(entry?.JsActiveContract);
    if (active) return [parseCreated(active.createdEvent)];
    // Reject truncated/error or unexpected responses instead of claiming an empty ACS.
    throw new Error("Unsupported active-contract entry in this single-Sandbox PoC");
  });
}
