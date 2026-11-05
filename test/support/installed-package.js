import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

export function run(command, args, cwd, capture = false, env = process.env) {
  const result = spawnSync(command, args, {
    cwd, env, encoding: "utf8", stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  return result.stdout;
}

export async function withInstalledPackage(fixturesDirectory, use) {
  const temporary = await mkdtemp(path.join(tmpdir(), "stl-package-"));
  try {
    // prepack builds from source; the tarball and consumer stay outside the checkout.
    const packed = JSON.parse(run("npm", [
      "pack", "--offline", "--json", "--pack-destination", temporary,
    ], root, true));
    assert.equal(packed.length, 1);
    const manifest = packed[0];
    const files = manifest.files.map(({ path }) => path);
    assert.ok(["package.json", "README.md", "LICENSE"].every((file) => files.includes(file)));
    assert.ok(files.some((file) => file.startsWith("dist/") && file.endsWith(".js")));
    assert.ok(files.some((file) => file.startsWith("dist/") && file.endsWith(".d.ts")));
    assert.ok(files.every((file) => ["package.json", "README.md", "LICENSE"].includes(file)
      || /^dist\/[^/]+\.(js|d\.ts)$/.test(file)), "Tarball must exclude development files");
    console.log("Tarball contents verified.");

    const consumer = path.join(temporary, "consumer");
    await cp(path.join(root, fixturesDirectory), consumer, { recursive: true });
    await writeFile(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
    run("npm", [
      "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
      "--no-package-lock", "--cache", path.join(temporary, "npm-cache"),
      path.join(temporary, manifest.filename),
    ], consumer);

    const installed = path.join(consumer, "node_modules/@cobuilders/canton-stl");
    assert.equal((await lstat(installed)).isSymbolicLink(), false);
    await use(consumer);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
