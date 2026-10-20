import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
if (process.env.RADAR_PAID_SMOKE_APPROVED !== "true" || process.env.RADAR_RUNPOD_APPROVED !== "true") {
  throw new Error("Paid smoke test disabled. Obtain separate user cost approval and configure the endpoint first.");
}
const out = new URL("../../../generated-artifacts/radar-smoke.mjs", import.meta.url);
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../src/lib/radar/evaluate.ts", import.meta.url).pathname],
  outfile: out.pathname, bundle: true, platform: "node", format: "esm",
  external: ["@workspace/db"],
});
const result = spawnSync(process.execPath, [out.pathname], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
