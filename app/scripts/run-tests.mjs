import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareBraces } from "./security/prepare-braces.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));

/** Keep the supported npm test entrypoints away from Vitest's vulnerable APIs. */
export function buildVitestArgs(mode, filters = []) {
  if (mode !== "run" && mode !== "watch") throw new Error("Unsupported test mode");
  for (let i = 0; i < filters.length; i++) {
    const arg = filters[i];
    if (arg === "-t" || arg === "--testNamePattern") {
      const value = filters[++i];
      if (!value || value.startsWith("-")) throw new Error("Invalid test-name filter");
    } else if (arg === "--reporter=default" || arg === "--reporter=verbose") {
      // Built-in reporters only; custom reporter modules execute code.
    } else if (arg.startsWith("-") || !/^[a-zA-Z0-9_./-]+\.test\.ts$/.test(arg) || arg.startsWith("/") || arg.split("/").includes("..")) {
      throw new Error("Unsupported test option; API/UI/browser/debugger and alternate config are prohibited");
    }
  }
  return [
    mode === "run" ? "run" : "--watch",
    ...filters,
    "--config", path.join(project, "vitest.config.ts"),
    "--no-api", "--no-ui", "--browser.enabled=false",
    "--no-inspect", "--no-inspect-brk",
  ];
}

function main() {
  let args;
  try {
    const [mode, ...filters] = process.argv.slice(2);
    if (process.env.CI && (mode !== "run" || filters.length)) {
      throw new Error("CI must run the full suite without watch mode or filters");
    }
    if (process.debugPort !== 9229 || /--inspect/.test(process.env.NODE_OPTIONS || "") || process.execArgv.some((arg) => arg.startsWith("--inspect"))) {
      throw new Error("Debugger-enabled test execution is prohibited");
    }
    args = buildVitestArgs(mode, filters);
    prepareBraces({ verify: true });
  } catch (err) {
    console.error(`[test-containment] ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [
    "--disable-proto=throw",
    path.join(project, "node_modules/vitest/vitest.mjs"),
    ...args,
  ], { cwd: project, stdio: "inherit", shell: false });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("[test-containment] Unable to start the installed Vitest runner");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
