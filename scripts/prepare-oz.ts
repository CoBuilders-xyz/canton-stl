import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const upstream = JSON.parse(await readFile(new URL("../examples/oz-pausable-vault/upstream.json", import.meta.url), "utf8")) as {
  repository: string; commit: string; archiveSha256: string; sdkVersion: string; vaultPath: string; packages: string[];
};
export const upstreamRoot = path.join(root, ".cache", `openzeppelin-${upstream.commit}`);
export const vaultDar = path.join(upstreamRoot, upstream.vaultPath, ".daml/dist/pausable-vault-example-0.0.0.dar");

function run(command: string, args: string[], cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export async function prepareOz() {
  const cache = path.join(root, ".cache");
  await mkdir(cache, { recursive: true });
  const archive = path.join(cache, `openzeppelin-${upstream.commit}.tar.gz`);
  const url = `https://codeload.github.com/OpenZeppelin/canton-contracts/tar.gz/${upstream.commit}`;
  console.log(`OpenZeppelin source: ${upstream.repository}/tree/${upstream.commit}`);
  run("curl", ["--fail", "--location", "--retry", "3", "--output", archive, url]);
  const digest = sha256(await readFile(archive));
  if (digest !== upstream.archiveSha256) throw new Error(`OpenZeppelin archive checksum mismatch: ${digest}`);
  // Always build from a fresh extraction of the verified upstream archive.
  await rm(upstreamRoot, { recursive: true, force: true });
  await mkdir(upstreamRoot);
  run("tar", ["-xzf", archive, "--strip-components=1", "-C", upstreamRoot]);
  for (const pkg of upstream.packages) {
    console.log(`Building upstream package: ${pkg}`);
    run("dpm", ["build"], upstreamRoot, { ...process.env, DAML_PACKAGE: pkg });
  }
  const vaultSource = `${upstream.vaultPath}/daml/OpenZeppelin/Examples/Pausable/Vault.daml`;
  const evidence = {
    repository: upstream.repository, commit: upstream.commit,
    archiveUrl: url, archiveSha256: digest, sdkVersion: upstream.sdkVersion,
    vaultSource: `${upstream.repository}/blob/${upstream.commit}/${vaultSource}`,
    vaultSourceSha256: sha256(await readFile(path.join(upstreamRoot, vaultSource))),
    darSha256: sha256(await readFile(vaultDar)),
  };
  await mkdir(path.join(root, ".reports"), { recursive: true });
  await writeFile(path.join(root, ".reports/oz-provenance.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  return vaultDar;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareOz();
