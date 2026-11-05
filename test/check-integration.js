import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, withInstalledPackage } from "./support/installed-package.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), "stl-fixture-"));
try {
  await cp(path.join(root, "test/fixtures/contracts"), fixture, { recursive: true });
  // Missing toolchains are errors; this command never substitutes a mock or skips.
  run("dpm", ["build"], fixture);
  const dar = path.join(fixture, ".daml/dist/stl-test-fixture-1.0.0.dar");
  await access(dar);
  await withInstalledPackage("test/integration", async (consumer) => {
    run(process.execPath, [
      "--no-experimental-strip-types", "--test", "--test-concurrency=1", "sandbox.test.js",
    ], consumer, false, { ...process.env, STL_TEST_DAR: dar });
  });
} finally {
  await rm(fixture, { recursive: true, force: true });
}
