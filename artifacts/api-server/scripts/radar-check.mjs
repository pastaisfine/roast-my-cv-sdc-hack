import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const out = new URL("../../../generated-artifacts/radar-tests.mjs", import.meta.url);
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../src/lib/radar/radar.test.ts", import.meta.url).pathname],
  outfile: out.pathname, bundle: true, platform: "node", format: "esm",
  external: ["drizzle-orm", "@workspace/db"],
  alias: { "drizzle-orm": new URL("../node_modules/drizzle-orm/index.js", import.meta.url).pathname },
});
const result = spawnSync(process.execPath, ["--test", out.pathname], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
