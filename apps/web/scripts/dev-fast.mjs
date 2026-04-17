import { spawn } from "node:child_process";
import process from "node:process";

const NEXT_ARGS = ["./node_modules/next/dist/bin/next", "dev", "--webpack"];
const ROUTES_TO_WARM = ["/", "/ask", "/write"];

let warmed = false;
let localUrl = "http://127.0.0.1:3000";

const child = spawn(process.execPath, NEXT_ARGS, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

function forward(stream, target) {
  stream.setEncoding("utf8");
  stream.on("data", async (chunk) => {
    target.write(chunk);
    if (!warmed) {
      const localMatch = chunk.match(/Local:\s+(https?:\/\/[^\s]+)/);
      if (localMatch?.[1]) {
        localUrl = localMatch[1].replace("localhost", "127.0.0.1");
      }

      if (chunk.includes("Ready in")) {
        warmed = true;
        target.write(">> Prewarming /, /ask, /write so the first browser load does not stall...\n");
        await warmRoutes();
      }
    }
  });
}

async function warmRoutes() {
  for (const route of ROUTES_TO_WARM) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${localUrl}${route}`, {
        headers: { "x-dev-prewarm": "1" },
      });
      const elapsed = Date.now() - startedAt;
      process.stdout.write(`>> Warmed ${route} (${response.status}) in ${elapsed}ms\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`>> Warmup failed for ${route}: ${message}\n`);
    }
  }

  process.stdout.write(`>> Warm routes ready at ${localUrl}\n`);
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
