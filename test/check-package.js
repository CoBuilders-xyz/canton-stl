import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, withInstalledPackage } from "./support/installed-package.js";

const root = fileURLToPath(new URL("../", import.meta.url));
await withInstalledPackage("test/package-consumer", async (consumer) => {
  run(process.execPath, ["--no-experimental-strip-types", "consumer.js"], consumer);
  // Use the existing compiler, with resolution rooted in the independent consumer.
  run(process.execPath, [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "--project", path.join(consumer, "tsconfig.json"),
  ], consumer);
  console.log(`Installed JS and TS consumers passed (${process.version}, ${process.platform}/${process.arch}).`);
});
