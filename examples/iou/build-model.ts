import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("./model/", import.meta.url));
export const exampleDar = path.join(packageRoot, ".daml/dist/network-helpers-example-1.0.0.dar");

export async function buildExampleDar(): Promise<string> {
  // Resolve the version pinned in model/daml.yaml, not the last cached compiler.
  const result = spawnSync("dpm", ["build"], { cwd: packageRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`dpm build failed (${result.status ?? result.signal})`);
  await access(exampleDar);
  return exampleDar;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildExampleDar());
}
