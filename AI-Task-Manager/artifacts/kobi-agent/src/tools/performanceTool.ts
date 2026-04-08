import { runCommand } from "./terminalTool";

export async function getSystemMetrics(): Promise<{ success: boolean; output: string; metrics?: any }> {
  const [cpuResult, memResult, diskResult, nodeProcs] = await Promise.all([
    runCommand({ command: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`, timeout: 5000 }),
    runCommand({ command: `free -m | awk 'NR==2{printf "%s %s %.2f", $3, $2, $3*100/$2}'`, timeout: 3000 }),
    runCommand({ command: `df -m / | awk 'NR==2{printf "%s %s %s", $3, $2, $5}'`, timeout: 3000 }),
    runCommand({ command: `ps aux | grep -E 'node|npm|tsx' | grep -v grep | awk '{printf "%s %.1f %.1f %s\\n", $2, $3, $4, $11}'`, timeout: 3000 }),
  ]);

  const memParts = memResult.stdout.trim().split(" ");
  const diskParts = diskResult.stdout.trim().split(" ");
  const processes = nodeProcs.stdout.trim().split("\n").filter(Boolean).map(line => {
    const parts = line.split(" ");
    return { pid: parseInt(parts[0]) || 0, cpu: parseFloat(parts[1]) || 0, memory: parseFloat(parts[2]) || 0, command: parts.slice(3).join(" ") };
  });

  const metrics = {
    cpu: parseFloat(cpuResult.stdout.trim()) || 0,
    memory: { used: parseInt(memParts[0]) || 0, total: parseInt(memParts[1]) || 0, percent: parseFloat(memParts[2]) || 0 },
    disk: { used: parseInt(diskParts[0]) || 0, total: parseInt(diskParts[1]) || 0, percent: parseFloat(diskParts[2]) || 0 },
    nodeProcesses: processes,
  };

  const output = `CPU: ${metrics.cpu}%\nMemory: ${metrics.memory.used}MB/${metrics.memory.total}MB (${metrics.memory.percent}%)\nDisk: ${metrics.disk.used}MB/${metrics.disk.total}MB (${metrics.disk.percent}%)\nNode processes: ${processes.length}`;
  return { success: true, output, metrics };
}

export async function bundleAnalysis(): Promise<{ success: boolean; output: string; files?: any[] }> {
  await runCommand({ command: "npm run build", timeout: 120000 });
  const result = await runCommand({ command: `find dist build .next/static -type f \\( -name "*.js" -o -name "*.css" \\) 2>/dev/null | head -50`, timeout: 10000 });

  const files: Array<{ file: string; size: number; gzipped: number }> = [];
  let totalSize = 0;

  for (const file of result.stdout.split("\n").filter(Boolean)) {
    const [sizeResult, gzipResult] = await Promise.all([
      runCommand({ command: `wc -c < "${file}"` }),
      runCommand({ command: `gzip -c "${file}" | wc -c` }),
    ]);
    const size = parseInt(sizeResult.stdout.trim()) || 0;
    const gzipped = parseInt(gzipResult.stdout.trim()) || 0;
    files.push({ file, size, gzipped });
    totalSize += size;
  }

  files.sort((a, b) => b.size - a.size);
  const output = `Total: ${(totalSize / 1024).toFixed(1)}KB\n` + files.map(f => `${f.file}: ${(f.size / 1024).toFixed(1)}KB (gzip: ${(f.gzipped / 1024).toFixed(1)}KB)`).join("\n");
  return { success: true, output, files };
}

export async function simpleLoadTest(params: { url: string; requests?: number; concurrency?: number }): Promise<{ success: boolean; output: string; result?: any }> {
  const requests = params.requests || 100;
  const script = `total=0; success=0; failed=0; total_time=0; min_time=999999; max_time=0; for i in $(seq 1 ${requests}); do start=$(date +%s%N); status=$(curl -s -o /dev/null -w "%{http_code}" "${params.url}"); end=$(date +%s%N); time=$(( (end - start) / 1000000 )); total=$((total + 1)); total_time=$((total_time + time)); if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then success=$((success + 1)); else failed=$((failed + 1)); fi; if [ "$time" -lt "$min_time" ]; then min_time=$time; fi; if [ "$time" -gt "$max_time" ]; then max_time=$time; fi; done; echo "$total $success $failed $total_time $min_time $max_time"`;

  const startTime = Date.now();
  const cmdResult = await runCommand({ command: `bash -c '${script}'`, timeout: 300000 });
  const duration = Date.now() - startTime;
  const parts = cmdResult.stdout.trim().split(" ");

  const loadResult = {
    totalRequests: parseInt(parts[0]) || requests,
    successfulRequests: parseInt(parts[1]) || 0,
    failedRequests: parseInt(parts[2]) || 0,
    avgResponseTime: parseInt(parts[3]) / (parseInt(parts[0]) || 1),
    minResponseTime: parseInt(parts[4]) || 0,
    maxResponseTime: parseInt(parts[5]) || 0,
    requestsPerSecond: (parseInt(parts[0]) || 0) / (duration / 1000),
    duration,
  };

  const output = `Load Test: ${params.url}\nRequests: ${loadResult.totalRequests} (${loadResult.successfulRequests} ok, ${loadResult.failedRequests} failed)\nAvg: ${loadResult.avgResponseTime.toFixed(0)}ms | Min: ${loadResult.minResponseTime}ms | Max: ${loadResult.maxResponseTime}ms\nRPS: ${loadResult.requestsPerSecond.toFixed(1)}`;
  return { success: true, output, result: loadResult };
}

export async function analyzeNodeModules(): Promise<{ success: boolean; output: string }> {
  const [totalResult, topResult] = await Promise.all([
    runCommand({ command: `du -sh node_modules 2>/dev/null | cut -f1` }),
    runCommand({ command: `du -sh node_modules/*/ 2>/dev/null | sort -rh | head -20` }),
  ]);

  const output = `Total: ${totalResult.stdout.trim()}\n\nTop packages:\n${topResult.stdout}`;
  return { success: true, output };
}

export const PERFORMANCE_TOOLS = [
  { name: "get_system_metrics", description: "Get CPU, memory, disk usage and running Node processes", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "bundle_analysis", description: "Build and analyze bundle sizes (JS/CSS files)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "simple_load_test", description: "Run a simple HTTP load test against a URL", input_schema: { type: "object" as const, properties: { url: { type: "string" }, requests: { type: "number" }, concurrency: { type: "number" } }, required: ["url"] as string[] } },
  { name: "analyze_node_modules", description: "Analyze node_modules size and top packages", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];