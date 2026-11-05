import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parseCLI } from "vitest/node";
import { buildVitestArgs } from "../../scripts/run-tests.mjs";

test("run and watch profiles resolve with all privileged test servers disabled", () => {
  for (const mode of ["run", "watch"]) {
    const { options } = parseCLI(["vitest", ...buildVitestArgs(mode)]);
    assert.equal(options.api, false);
    assert.equal(options.ui, false);
    assert.equal(options.browser.enabled, false);
    assert.equal(options.inspect, false);
    assert.equal(options.inspectBrk, false);
    assert.equal(mode === "run" ? options.run : options.watch, true);
  }
});

test("legitimate unit-file and test-name filters remain usable", () => {
  const args = buildVitestArgs("run", ["tests/unit/auth-actions.test.ts", "-t", "logout completion", "--reporter=verbose"]);
  assert.ok(args.includes("logout completion"));
  assert.ok(args.includes("tests/unit/auth-actions.test.ts"));
});

for (const flag of ["--api", "--api.host=0.0.0.0", "--api.test.ts", "--ui.test.ts", "--browser.enabled.test.ts", "--ui", "--browser", "--browser.enabled", "--inspect", "--poolOptions.forks.execArgv=--inspect=0.0.0.0", "--config=other.ts", "--workspace=other.ts", "--root=/tmp", "--host=0.0.0.0", "--reporter=attacker.mjs", "--"]) {
  test(`rejects ${flag} before starting Vitest`, () => {
    const result = spawnSync(process.execPath, ["scripts/run-tests.mjs", "run", flag], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /test-containment/);
    assert.doesNotMatch(result.stdout, /RUN|Vitest/);
  });
}

test("CI cannot filter away tests or enter watch mode", () => {
  for (const args of [["run", "tests/unit/money.test.ts"], ["watch"]]) {
    const result = spawnSync(process.execPath, ["scripts/run-tests.mjs", ...args], { env: { ...process.env, CI: "true" }, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /full suite/);
  }
});

test("the Node flag blocks the __proto__ pollution primitive", () => {
  const result = spawnSync(process.execPath, ["--disable-proto=throw", "-e", "try { ({}).__proto__ = {}; process.exit(2); } catch (e) { process.exit(e.code === 'ERR_PROTO_ACCESS' ? 0 : 3); }"], { timeout: 5000 });
  assert.equal(result.status, 0);
});

// These assertions run in the offline CI container profile, not as skipped tests.
if (process.env.STORE_ISOLATED_TESTS === "1") {
  test("isolated runner has no external network adapter", () => {
    assert.ok(Object.values(os.networkInterfaces()).flat().every((entry) => entry.internal));
  });
  test("isolated runner is unprivileged and cannot access the host Docker socket", () => {
    assert.notEqual(process.getuid(), 0);
    assert.equal(fs.existsSync("/var/run/docker.sock"), false);
  });
  test("isolated runner has no effective Linux capabilities and cannot gain privileges", () => {
    const status = fs.readFileSync("/proc/self/status", "utf8");
    assert.match(status, /CapEff:\s+0+\n/);
    assert.match(status, /NoNewPrivs:\s+1\n/);
  });
  test("isolated runner cannot mutate its read-only application image", () => {
    assert.throws(() => fs.writeFileSync("/app/.containment-probe", "probe"), (err) => ["EROFS", "EACCES"].includes(err.code));
  });
  test("isolated runner contains neither repository git metadata nor runtime secrets", () => {
    assert.equal(fs.existsSync("/app/.git"), false);
    for (const name of ["GITHUB_TOKEN", "GH_TOKEN", "JWT_SECRET", "DATABASE_URL", "DIRECT_URL", "EMERGENT_LLM_KEY"]) {
      assert.equal(process.env[name], undefined);
    }
  });
}
