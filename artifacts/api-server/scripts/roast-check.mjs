import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const out = new URL("../../../generated-artifacts/roast-tests.mjs", import.meta.url);
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../src/lib/gemini/roast.test.ts", import.meta.url).pathname],
  outfile: out.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
});
const result = spawnSync(process.execPath, ["--test", out.pathname], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "test" },
});
process.exitCode = result.status ?? 1;
