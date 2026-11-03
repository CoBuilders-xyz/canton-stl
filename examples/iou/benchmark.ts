import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { exampleDar } from "./build-model.ts";
import { startSandbox, type Sandbox } from "../../src/index.ts";
import { exerciseIou, setupIou } from "./test/support/iou.ts";

const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 3);
if (!Number.isInteger(iterations) || iterations < 2 || iterations > 20) throw new Error("BENCHMARK_ITERATIONS must be 2..20");

async function scenario(sandbox: Sandbox) {
  const started = performance.now();
  const { alice, bob, iou } = await setupIou(sandbox);
  assert.deepEqual(await bob.activeContracts(), [iou.contractId]);
  await alice.submit([exerciseIou(iou.contractId, "Settle")]);
  assert.deepEqual(await bob.activeContracts(), []);
  return performance.now() - started;
}

// Same application work in both paths. Build time is excluded; teardown is included.
const cold: { startupMs: number; scenarioMs: number; totalMs: number }[] = [];
const coldStarted = performance.now();
for (let i = 0; i < iterations; i++) {
  const started = performance.now();
  const sandbox = await startSandbox({ dars: [exampleDar] });
  let scenarioMs: number;
  try { scenarioMs = await scenario(sandbox); }
  finally { await sandbox.stop(); }
  cold.push({ startupMs: sandbox.startupMs, scenarioMs, totalMs: performance.now() - started });
  console.log(`Cold scenario ${i + 1}/${iterations} complete`);
}
const coldTotalMs = performance.now() - coldStarted;
const warmStarted = performance.now();
const shared = await startSandbox({ dars: [exampleDar] });
const warmScenarioMs: number[] = [];
try {
  for (let i = 0; i < iterations; i++) warmScenarioMs.push(await scenario(shared));
} finally { await shared.stop(); }
const warmTotalMs = performance.now() - warmStarted;

const report = {
  measuredAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`,
  canton: "3.5.6", modelSdk: "3.5.2", iterations,
  workload: "Fresh parties/users, create IOU, query, settle, verify empty owner ACS",
  cold, coldTotalMs, warm: { startupMs: shared.startupMs, scenarioMs: warmScenarioMs, totalMs: warmTotalMs },
  totalReductionPercent: 100 * (coldTotalMs - warmTotalMs) / coldTotalMs,
  limitation: "Local sequential sample; not a comparison with another toolkit, external adoption, or snapshot restore. Build excluded. Cold runs precede warm runs; OS caches may affect timings.",
};
await mkdir(new URL("./.reports/", import.meta.url), { recursive: true });
await writeFile(new URL("./.reports/benchmark.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
