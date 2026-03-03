/**
 * Performance benchmarking utilities for GPU/custom tier evaluator wrappers.
 * Generates an inline JS script providing benchmark, measureMemory, and measureGpu globals.
 */

/**
 * Returns a JS string defining benchmark utilities for Docker evaluator wrappers.
 * These become available as globals in GPU/custom tier evaluator contexts.
 */
export function generateBenchmarkInlineScript(): string {
  return `
// --- Benchmark utilities (inlined) ---
function benchmark(fn, iterations) {
  iterations = iterations || 10;
  var times = [];
  for (var i = 0; i < iterations; i++) {
    var start = process.hrtime.bigint();
    fn();
    var end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ns -> ms
  }
  times.sort(function(a, b) { return a - b; });
  var sum = times.reduce(function(a, b) { return a + b; }, 0);
  var mid = Math.floor(times.length / 2);
  var p95Idx = Math.floor(times.length * 0.95);
  return {
    meanMs: Math.round(sum / times.length * 100) / 100,
    medianMs: times.length % 2 === 0
      ? Math.round((times[mid - 1] + times[mid]) / 2 * 100) / 100
      : Math.round(times[mid] * 100) / 100,
    minMs: Math.round(times[0] * 100) / 100,
    maxMs: Math.round(times[times.length - 1] * 100) / 100,
    p95Ms: Math.round(times[p95Idx] * 100) / 100,
  };
}

function measureMemory() {
  try {
    var fs = require("fs");
    var status = fs.readFileSync("/proc/self/status", "utf-8");
    var match = status.match(/VmRSS:\\s+(\\d+)/);
    if (match) return { rssKb: parseInt(match[1], 10) };
  } catch (e) {}
  var mem = process.memoryUsage();
  return { rssKb: Math.round(mem.rss / 1024) };
}

function measureGpu() {
  try {
    var cp = require("child_process");
    var out = cp.execSync("nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits", { timeout: 5000 }).toString().trim();
    var parts = out.split(",").map(function(s) { return parseInt(s.trim(), 10); });
    return { gpuUtil: parts[0] || 0, memoryUsedMB: parts[1] || 0 };
  } catch (e) {
    return { gpuUtil: null, memoryUsedMB: null, error: "nvidia-smi not available" };
  }
}
`;
}
