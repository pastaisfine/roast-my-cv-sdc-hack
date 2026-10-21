import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const out = new URL("../../../generated-artifacts/import-tests.mjs", import.meta.url);
const stub = new URL("../../roast-my-cv/src/lib/cv-import.test-stubs.ts", import.meta.url).pathname;
await mkdir(new URL("../../../generated-artifacts/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../../roast-my-cv/src/lib/cv-import.test.ts", import.meta.url).pathname],
  outfile: out.pathname, bundle: true, platform: "node", format: "esm",
  plugins: [{
    name: "deterministic-import-adapters",
    setup(build) {
      build.onResolve({ filter: /^pdfjs-dist.*\?url$/ }, () => ({ path: "pdf-worker", namespace: "stub-url" }));
      build.onLoad({ filter: /.*/, namespace: "stub-url" }, () => ({ contents: 'export default "synthetic-worker-url";' }));
      build.onResolve({ filter: /^(pdfjs-dist\/legacy\/build\/pdf\.mjs|@workspace\/api-client-react)$/ }, () => ({ path: stub }));
    },
  }],
});
const result = spawnSync(process.execPath, ["--test", out.pathname], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
