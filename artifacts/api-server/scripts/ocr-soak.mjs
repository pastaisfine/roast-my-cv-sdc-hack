import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const apiRoot = process.cwd();
const projectRoot = resolve(apiRoot, "../..");
const outputDir = resolve(projectRoot, "generated-artifacts");
const fixture = resolve(outputDir, "cv-ocr-soak.png");
const runner = resolve(outputDir, "ocr-soak-runner.mjs");
await mkdir(outputDir, { recursive: true });

const generated = spawnSync(resolve(projectRoot, ".pythonlibs/bin/python"), ["ocr/soak_fixture.py"], {
  cwd: apiRoot, encoding: "utf8",
});
if (generated.status !== 0) {
  process.stderr.write(generated.stderr || "Could not generate the synthetic OCR soak image.\n");
  process.exit(generated.status ?? 1);
}

await build({
  entryPoints: [resolve(apiRoot, "scripts/ocr-soak-runner.ts")],
  outfile: runner,
  bundle: true,
  platform: "node",
  format: "esm",
});

const result = spawnSync(process.execPath, [runner, fixture], {
  cwd: apiRoot,
  env: process.env,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
