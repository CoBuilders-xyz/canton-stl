import { randomBytes } from "node:crypto";
import { ledgerJson } from "./http.ts";
import type { Sandbox } from "./sandbox.ts";

export type FreshParty = {
  /** Hint passed by the caller, before the run suffix. */
  hint: string;
  /** Hint actually allocated, including the run suffix. */
  allocatedHint: string;
  /** Full party id, `hint::namespace`. */
  partyId: string;
  /** Ledger user created for this party. No token is issued. */
  userId: string;
};

type AllocateResponse = {
  partyDetails?: { party?: string };
};

/**
 * Allocate one party and one user per hint on the Sandbox this process owns.
 * Each call appends a new suffix, so the same hint can be used again in the
 * next test without restarting Canton.
 */
export async function freshParties<const Hints extends readonly string[]>(
  sandbox: Sandbox,
  hints: Hints,
  options?: { suffix?: string },
): Promise<Record<Hints[number], FreshParty>> {
  if (hints.length === 0) {
    throw new Error("freshParties requires at least one hint");
  }
  const seen = new Set<string>();
  for (const hint of hints) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(hint)) {
      throw new Error(`party hint must match [A-Za-z][A-Za-z0-9_-]{0,40}: ${hint}`);
    }
    if (seen.has(hint)) {
      throw new Error(`duplicate party hint: ${hint}`);
    }
    seen.add(hint);
  }

  const suffix = options?.suffix ?? `run-${randomBytes(12).toString("hex")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(suffix)) {
    throw new Error(`suffix must match [A-Za-z0-9][A-Za-z0-9_-]{0,40}: ${suffix}`);
  }

  const parties: Record<string, FreshParty> = {};
  for (const hint of hints) {
    const allocatedHint = `${hint}-${suffix}`;
    const allocated = await ledgerJson<AllocateResponse>(sandbox.jsonApiUrl, "/v2/parties", {
      method: "POST",
      body: { partyIdHint: allocatedHint, identityProviderId: "" },
    });
    const partyId = allocated.partyDetails?.party;
    if (!partyId?.startsWith(`${allocatedHint}::`)) {
      throw new Error(`allocate ${allocatedHint} returned no party id: ${JSON.stringify(allocated)}`);
    }

    const userId = allocatedHint;
    await ledgerJson(sandbox.jsonApiUrl, "/v2/users", {
      method: "POST",
      body: {
        user: {
          id: userId,
          primaryParty: partyId,
          isDeactivated: false,
          identityProviderId: "",
          metadata: { resourceVersion: "", annotations: {} },
        },
        rights: [
          { kind: { CanActAs: { value: { party: partyId } } } },
          { kind: { CanReadAs: { value: { party: partyId } } } },
        ],
      },
    });

    parties[hint] = { hint, allocatedHint, partyId, userId };
  }
  return parties as Record<Hints[number], FreshParty>;
}
