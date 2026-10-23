import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const out = new URL("../../../generated-artifacts/ocr-runpod-tests.mjs", import.meta.url);
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../src/lib/ocr-runpod.test.ts", import.meta.url).pathname],
  outfile: out.pathname, bundle: true, platform: "node", format: "esm",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
// Run from the API package so external package resolution and trusted worker paths match runtime.
const result = spawnSync(process.execPath, ["--test", out.pathname], { encoding: "utf8", env: { ...process.env, NODE_ENV: "production" } });
const output = (result.stdout ?? "") + (result.stderr ?? "");
if (output.includes("CV_PRIVATE_SENTINEL") || output.includes("PRIVATE_FILENAME_SENTINEL")) {
  process.stderr.write("Privacy regression: input content appeared in test logs.\n"); process.exitCode = 1;
} else { process.stdout.write(output); process.exitCode = result.status ?? 1; }
