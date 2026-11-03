import { it } from "node:test";
import assert from "node:assert/strict";
import { exampleDar } from "../../build-model.ts";
import { withSandbox } from "../../../../src/index.ts";
import { exerciseIou, setupIou } from "../support/iou.ts";

it("uses the same fixture with node:test and releases Sandbox after a failing callback", { timeout: 120_000 }, async () => {
  let endpoint = "";
  const intendedFailure = new Error("intentional callback failure");
  await assert.rejects(withSandbox(async (sandbox) => {
    endpoint = sandbox.jsonApiUrl;
    const { alice, bob, iou } = await setupIou(sandbox);
    assert.deepEqual(await bob.activeContracts(), [iou.contractId]);
    await alice.submit([exerciseIou(iou.contractId, "Settle")]);
    assert.deepEqual(await bob.activeContracts(), []);
    throw intendedFailure;
  }, { dars: [exampleDar] }), (error: unknown) => error === intendedFailure);
  assert.notEqual(endpoint, "");
  await assert.rejects(fetch(`${endpoint}/v2/version`, { signal: AbortSignal.timeout(1000) }));
});
