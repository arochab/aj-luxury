import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run analytics build canaries through npm.");
}
const canaries = {
  raw: ["resolved-module", "?raw"],
  url: ["resolved-module", "?url"],
  js: ["emitted-artifact", "order_paid", ".js"],
  txt: [
    "emitted-artifact",
    "canonical_commerce_d1_not_integrated",
    ".txt",
  ],
};

for (const [canary, expected] of Object.entries(canaries)) {
  const result = await runBuild(canary);
  if (result.code === 0) {
    throw new Error(`Analytics ${canary} canary unexpectedly passed npm run build.`);
  }
  for (const evidence of [
    "analytics-server-module-forbidden-in-client-build",
    ...expected,
  ]) {
    if (!result.output.includes(evidence)) {
      throw new Error(
        `Analytics ${canary} canary failed without ${JSON.stringify(evidence)}.\n${result.output}`,
      );
    }
  }
  console.log(`Analytics ${canary} canary: npm run build rejected as expected.`);
}

function runBuild(canary) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", "build"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ANALYTICS_CLIENT_BOUNDARY_CANARY: canary,
      },
      shell: false,
      windowsHide: true,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}
