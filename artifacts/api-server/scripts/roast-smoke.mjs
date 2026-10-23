import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

if (process.env.ROAST_SMOKE_APPROVED !== "true") {
  throw new Error("Live roast smoke test disabled. Set ROAST_SMOKE_APPROVED=true to spend free-tier Gemini tokens.");
}
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required for the live roast smoke test.");
}
const out = new URL("../../../generated-artifacts/roast-smoke.mjs", import.meta.url);
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../src/lib/gemini/smoke.ts", import.meta.url).pathname],
  outfile: out.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
});
const result = spawnSync(process.execPath, [out.pathname], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
