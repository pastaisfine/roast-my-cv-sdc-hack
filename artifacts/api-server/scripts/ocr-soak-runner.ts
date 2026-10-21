import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { OcrWorker, OcrError } from "../src/lib/ocr";

type InternalJob = { signal: AbortSignal; imageBase64: string; };
type InternalWorker = {
  active: InternalJob | null;
  queue: InternalJob[];
  child: { pid?: number } | null;
  pending: number;
};
type JobRecord = {
  id: number;
  controller: AbortController;
  queuedAt: number;
  activeAt?: number;
  completedAt?: number;
  status: "pending" | "success" | "error";
  errorStatus?: number;
};
type ActionSample = { action: string; status: number; ms: number; atSeconds: number; pendingAtStart: number; };
type MemorySample = { atSeconds: number; pending: number; workerRssMiB: number | null; workerHwmMiB: number | null; cgroupMiB: number | null; };

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("Synthetic fixture path argument is required.");
const durationMs = Number(process.env.OCR_SOAK_DURATION_MS ?? 180_000);
if (!Number.isFinite(durationMs) || durationMs < 10_000) throw new Error("OCR_SOAK_DURATION_MS must be at least 10000.");
const apiBase = (process.env.OCR_SOAK_API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const imageBase64 = readFileSync(fixturePath).toString("base64");
const worker = new OcrWorker();
const internal = worker as unknown as InternalWorker;
const jobRecords = new Map<AbortSignal, JobRecord>();
const jobs: JobRecord[] = [];
const actionSamples: ActionSample[] = [];
const memorySamples: MemorySample[] = [];
const observedPids = new Set<number>();
const startedAt = performance.now();
let stopMonitors = false;
let nextId = 1;
let maxPendingObserved = 0;

const sleep = (ms: number) => new Promise<void>(resolveSleep => setTimeout(resolveSleep, ms));
const atSeconds = () => Number(((performance.now() - startedAt) / 1000).toFixed(3));
const readProcMiB = (pid: number, field: "VmRSS" | "VmHWM") => {
  try {
    const line = readFileSync(`/proc/${pid}/status`, "utf8").split("\n").find(value => value.startsWith(`${field}:`));
    return line ? Number(line.trim().split(/\s+/)[1]) / 1024 : null;
  } catch { return null; }
};
const readCgroupMiB = () => {
  try { return Number(readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim()) / 1024 / 1024; }
  catch { return null; }
};
const observeActive = () => {
  maxPendingObserved = Math.max(maxPendingObserved, worker.pending);
  const active = internal.active;
  if (active) {
    const record = jobRecords.get(active.signal);
    if (record && record.activeAt === undefined) record.activeAt = performance.now();
  }
  const pid = internal.child?.pid;
  if (pid) observedPids.add(pid);
};

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
}
function median(values: number[]) {
  return percentile(values, 0.5);
}
function summarize(values: number[]) {
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Number(Math.max(...values).toFixed(2)) : null };
}
function createJob() {
  const controller = new AbortController();
  const record: JobRecord = { id: nextId++, controller, queuedAt: performance.now(), status: "pending" };
  jobRecords.set(controller.signal, record);
  jobs.push(record);
  const promise = worker.extract(imageBase64, controller.signal).then(result => {
    if (!result.text.trim() || result.model !== "english_g2" || result.device !== "cpu") {
      throw new Error("Synthetic OCR returned an empty result or unexpected model/device.");
    }
    if (!/python/i.test(result.text) || !/sql/i.test(result.text)) {
      throw new Error("Synthetic OCR did not recover the expected Python and SQL fixture phrases.");
    }
    record.status = "success";
    record.completedAt = performance.now();
  }).catch((error: unknown) => {
    record.status = "error";
    record.completedAt = performance.now();
    record.errorStatus = error instanceof OcrError ? error.status : undefined;
    if (record.errorStatus !== 499) {
      failures.push(`job ${record.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }).finally(() => observeActive());
  return { record, promise };
}
const failures: string[] = [];

async function requestAction(action: string, path: string, init?: RequestInit) {
  const requestStart = performance.now();
  const pendingAtStart = worker.pending;
  let status = 0;
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    status = response.status;
    await response.arrayBuffer();
  } catch {
    status = 0;
  }
  actionSamples.push({ action, status, ms: Number((performance.now() - requestStart).toFixed(2)), atSeconds: atSeconds(), pendingAtStart });
  if (status !== 200) failures.push(`local ${action} endpoint returned ${status || "no response"}`);
}

async function baselineActions() {
  const reference = await fetch(`${apiBase}/api/radar/reference`, { signal: AbortSignal.timeout(10_000) });
  if (!reference.ok) throw new Error(`Radar reference preflight returned ${reference.status}.`);
  const referenceData = await reference.json() as { roles?: Array<{ id: string }> };
  const roleId = referenceData.roles?.[0]?.id;
  if (!roleId) throw new Error("Radar reference did not contain a local role to use for pathway probes.");
  const actions = [
    ["healthz", "/api/healthz", undefined],
    ["radar-reference", "/api/radar/reference", undefined],
    ["radar-pathway", "/api/radar/pathway", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, matchedSkillIds: [] }) }],
  ] as const;
  for (let round = 0; round < 5; round++) {
    await Promise.all(actions.map(([name, path, init]) => requestAction(`baseline-${name}`, path, init)));
  }
  return { roleId, actions };
}

async function monitorMemory() {
  while (!stopMonitors) {
    observeActive();
    const pid = internal.child?.pid;
    memorySamples.push({
      atSeconds: atSeconds(),
      pending: worker.pending,
      workerRssMiB: pid ? readProcMiB(pid, "VmRSS") : null,
      workerHwmMiB: pid ? readProcMiB(pid, "VmHWM") : null,
      cgroupMiB: readCgroupMiB(),
    });
    await sleep(1000);
  }
}

async function monitorLocalActions(actions: Awaited<ReturnType<typeof baselineActions>>["actions"]) {
  while (!stopMonitors) {
    await Promise.all(actions.map(([name, path, init]) => requestAction(name, path, init)));
    if (!stopMonitors) await sleep(3000);
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, message: string) {
  const until = performance.now() + timeoutMs;
  while (!predicate()) {
    observeActive();
    if (performance.now() > until) throw new Error(message);
    await sleep(20);
  }
}

async function waitForPidExit(pid: number, timeoutMs = 10_000) {
  const until = performance.now() + timeoutMs;
  while (readProcMiB(pid, "VmRSS") !== null && performance.now() < until) await sleep(50);
  return readProcMiB(pid, "VmRSS") === null;
}

async function main() {
  const cgroupAtStart = readCgroupMiB();
  const host = {
    platform: process.platform,
    arch: process.arch,
    visibleCpuCount: cpus().length,
    cpuQuota: readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim(),
    memoryLimitMiB: (() => {
      try { const value = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim(); return value === "max" ? null : Number(value) / 1024 / 1024; }
      catch { return null; }
    })(),
    cgroupAtStartMiB: cgroupAtStart,
  };
  const { roleId, actions } = await baselineActions();
  const monitor = monitorMemory();
  const localMonitor = monitorLocalActions(actions);

  const warmup = createJob();
  await warmup.promise;
  if (warmup.record.status !== "success") throw new Error("Synthetic OCR warmup failed.");
  const warmWorkerRssMiB = internal.child?.pid ? readProcMiB(internal.child.pid, "VmRSS") : null;

  // Exercise active-job cancellation with two waiting jobs, then measure recovery.
  const cancelActive = createJob();
  await waitUntil(() => internal.active?.signal === cancelActive.record.controller.signal, 30_000, "Warm worker did not start the cancellation probe.");
  const cancelledPid = internal.child?.pid;
  const queuedA = createJob();
  const queuedB = createJob();
  if (worker.pending !== 3) throw new Error(`Expected a saturated three-job queue, observed ${worker.pending}.`);
  const overflow = worker.extract(imageBase64, new AbortController().signal).then(
    () => "unexpected-success",
    error => error instanceof OcrError ? error.status : -1,
  );
  if (await overflow !== 429) throw new Error("A fourth OCR request was not rejected with 429 while the queue was full.");
  const cancelledAt = performance.now();
  cancelActive.record.controller.abort();
  await cancelActive.promise;
  if (cancelActive.record.errorStatus !== 499) throw new Error("Active cancellation did not return status 499.");
  if (!cancelledPid || !(await waitForPidExit(cancelledPid))) throw new Error("Cancelled worker process did not exit.");
  await waitUntil(() => queuedA.record.activeAt !== undefined || queuedB.record.activeAt !== undefined, 120_000, "Queued OCR did not resume after cancellation.");
  const recoveryStartedMs = Number(((Math.min(queuedA.record.activeAt ?? Infinity, queuedB.record.activeAt ?? Infinity) - cancelledAt)).toFixed(2));
  await Promise.all([queuedA.promise, queuedB.promise]);
  const recoveryCompleteMs = Number((performance.now() - cancelledAt).toFixed(2));

  const soakStart = performance.now();
  const soakEnd = soakStart + durationMs;
  const soakStartSeconds = (soakStart - startedAt) / 1000;
  const inflight = new Set<Promise<void>>();
  const fillQueue = () => {
    while (performance.now() < soakEnd && worker.pending < 3) {
      const item = createJob();
      inflight.add(item.promise);
      item.promise.finally(() => inflight.delete(item.promise));
    }
  };
  fillQueue();
  while (performance.now() < soakEnd) {
    observeActive();
    fillQueue();
    if (failures.length) break;
    if (inflight.size) await Promise.race([...inflight, sleep(100)]);
    else await sleep(100);
  }
  observeActive();
  const activeSignal = internal.active?.signal;
  for (const item of jobs) {
    if (item.queuedAt >= soakStart && item.status === "pending" && item.controller.signal !== activeSignal) item.controller.abort();
  }
  await Promise.all([...inflight]);
  const soakSeconds = Number(((soakEnd - soakStart) / 1000).toFixed(2));
  const drainMs = Number(Math.max(0, performance.now() - soakEnd).toFixed(2));

  // Kill the idle-after-drain worker with an active synthetic request and verify cleanup.
  const cleanupJob = createJob();
  await waitUntil(() => internal.active?.signal === cleanupJob.record.controller.signal, 30_000, "Cleanup OCR did not become active.");
  const cleanupPid = internal.child?.pid;
  cleanupJob.record.controller.abort();
  await cleanupJob.promise;
  const cleanupExited = !!cleanupPid && await waitForPidExit(cleanupPid);
  await waitUntil(() => worker.pending === 0 && internal.child === null && internal.active === null && internal.queue.length === 0, 10_000, "OCR worker/job references remained after cleanup.");
  const observedPidsExited = await Promise.all([...observedPids].map(waitForPidExit));
  stopMonitors = true;
  await Promise.all([monitor, localMonitor]);
  const soakMemorySamples = memorySamples.filter(sample =>
    sample.atSeconds >= soakStartSeconds && sample.atSeconds <= soakStartSeconds + soakSeconds,
  );
  const workerSamples = soakMemorySamples.filter(sample => sample.workerRssMiB !== null);
  const rssValues = workerSamples.map(sample => sample.workerRssMiB!);
  const split = Math.max(1, Math.floor(rssValues.length / 10));
  const firstRssMedian = median(rssValues.slice(0, split));
  const lastRssMedian = median(rssValues.slice(-split));
  const soakJobs = jobs.filter(job => job.queuedAt >= soakStart && job.completedAt !== undefined && job.completedAt <= soakEnd);
  const queuedDelays = soakJobs.filter(job => job.status === "success" && job.activeAt !== undefined)
    .map(job => Number((job.activeAt! - job.queuedAt).toFixed(2)));
  const serviceTimes = soakJobs.filter(job => job.status === "success" && job.activeAt !== undefined && job.completedAt !== undefined)
    .map(job => Number((job.completedAt! - job.activeAt!).toFixed(2)));
  const endpointSummary = Object.fromEntries(["healthz", "radar-reference", "radar-pathway"].map(name => {
    const samples = actionSamples.filter(sample => sample.action === name && sample.pendingAtStart === 3);
    return [name, { ...summarize(samples.map(sample => sample.ms)), non200: samples.filter(sample => sample.status !== 200).length }];
  }));
  const successfulJobs = jobs.filter(job => job.status === "success").length;
  const successfulSoakJobs = soakJobs.filter(job => job.status === "success").length;
  const unexpectedFailedJobs = jobs.filter(job => job.status === "error" && job.errorStatus !== 499).length;
  const report = {
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    durationRequestedSeconds: durationMs / 1000,
    durationObservedSeconds: soakSeconds,
    fixture: { dimensions: "2000x2000", pixels: 4_000_000, encodedBytes: Buffer.byteLength(imageBase64, "base64") },
    host,
    ocr: {
      successfulJobs,
      successfulJobsDuringSoak: successfulSoakJobs,
      cancelledJobs: jobs.filter(job => job.status === "error" && job.errorStatus === 499).length,
      failedJobs: unexpectedFailedJobs,
      jobsPerMinute: Number((successfulSoakJobs / (soakSeconds / 60)).toFixed(2)),
      postWindowDrainMs: drainMs,
      queueDelayMs: summarize(queuedDelays),
      activeServiceMs: summarize(serviceTimes),
      maxPending: maxPendingObserved,
      queueSaturatedMemorySamples: soakMemorySamples.filter(sample => sample.pending === 3).length,
      fourthRequestRejected: true,
      warmWorkerRssMiB,
      workerRssMiB: {
        peak: rssValues.length ? Number(Math.max(...rssValues).toFixed(2)) : null,
        firstDecileMedian: firstRssMedian,
        lastDecileMedian: lastRssMedian,
        lastMinusFirstDecileMedian: firstRssMedian === null || lastRssMedian === null ? null : Number((lastRssMedian - firstRssMedian).toFixed(2)),
        maxHighWaterMark: workerSamples.length ? Number(Math.max(...workerSamples.map(sample => sample.workerHwmMiB ?? 0)).toFixed(2)) : null,
      },
      cgroupMemoryMiB: {
        start: cgroupAtStart,
        peak: memorySamples.length ? Number(Math.max(...memorySamples.map(sample => sample.cgroupMiB ?? 0)).toFixed(2)) : null,
        end: readCgroupMiB(),
      },
      cancellation: { activeJobStatus: cancelActive.record.errorStatus, restartToQueuedStartMs: recoveryStartedMs, restartToQueuedSuccessMs: recoveryCompleteMs, cancelledPidExited: await waitForPidExit(cancelledPid!), queuedJobsSucceeded: queuedA.record.status === "success" && queuedB.record.status === "success" },
      cleanup: { finalCancelledWorkerExited: cleanupExited, allObservedWorkerPidsExited: observedPidsExited.every(Boolean), workerPidsObserved: [...observedPids], pendingAfterCleanup: worker.pending, noRetainedJobImages: internal.active === null && internal.queue.length === 0 },
      localActionsUnderLoad: endpointSummary,
      samples: memorySamples,
    },
    failures,
  };
  const reportPath = resolve(process.cwd(), "../../generated-artifacts/ocr-soak-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ ...report, ocr: { ...report.ocr, cgroupMemoryMiB: report.ocr.cgroupMemoryMiB, samples: undefined } }, null, 2) + "\n");

  if (failures.length || report.ocr.failedJobs || !cleanupExited || !observedPidsExited.every(Boolean) ||
      !report.ocr.queueSaturatedMemorySamples ||
      !endpointSummary.healthz.count || !endpointSummary["radar-reference"].count || !endpointSummary["radar-pathway"].count ||
      endpointSummary.healthz.non200 || endpointSummary["radar-reference"].non200 || endpointSummary["radar-pathway"].non200) {
    process.exitCode = 1;
  }
}

await main();
