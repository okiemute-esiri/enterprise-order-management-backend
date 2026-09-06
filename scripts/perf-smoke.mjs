import { createApp } from "../dist/src/app.js";

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("Unable to determine ephemeral server port");
}

const url = `http://127.0.0.1:${address.port}/health/live`;
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 25);
const requests = Number(process.env.PERF_REQUESTS ?? 500);
const latencies = [];
let failures = 0;
let next = 0;
const started = performance.now();

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const requestStarted = performance.now();
    try {
      const response = await fetch(url, { headers: { "x-request-id": `perf-${index}` } });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    }
    latencies.push(performance.now() - requestStarted);
  }
}

try {
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

latencies.sort((a, b) => a - b);
const elapsedMs = performance.now() - started;
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
const summary = {
  requests,
  concurrency,
  failures,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((requests / (elapsedMs / 1000)).toFixed(2)),
  p50Ms: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  p99Ms: Number(percentile(0.99).toFixed(2))
};

console.log(JSON.stringify({ event: "performance_smoke", ...summary }));

if (failures > 0) {
  process.exitCode = 1;
}
