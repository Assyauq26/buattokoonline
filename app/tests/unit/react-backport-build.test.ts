import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const req = createRequire(resolve(root, "next.config.js"));
type Config = {
  module: {
    rules: { test: RegExp | ((resource: string) => boolean); use: string[] }[];
  };
};
type Configure = (
  c: Config,
  options: { isServer: boolean; dev: boolean },
) => Config;
function matches(
  condition: RegExp | ((resource: string) => boolean),
  path: string,
) {
  return typeof condition === "function"
    ? condition(path)
    : condition.test(path);
}
function buildRule() {
  const prepare = vi.fn();
  const loader = Object.assign(
    (id: string) =>
      id === "node:child_process" ? { execFileSync: prepare } : req(id),
    { resolve: req.resolve },
  );
  const module = { exports: {} as { webpack: Configure } };
  vm.runInNewContext(readFileSync(resolve(root, "next.config.js"), "utf8"), {
    require: loader,
    module,
    __dirname: root,
    process: { execPath: process.execPath },
  });
  return module.exports.webpack;
}
describe("production React backport activation", () => {
  it.each([
    "/repo/app/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js",
    "C:\\repo\\app\\node_modules\\next\\dist\\compiled\\react-dom\\cjs\\react-dom-client.production.js",
  ])("actually targets the production renderer: %s", (path) => {
    const config = buildRule()(
      { module: { rules: [] } },
      { isServer: false, dev: false },
    );
    expect(config.module.rules).toHaveLength(1);
    expect(matches(config.module.rules[0].test, path)).toBe(true);
    expect(config.module.rules[0].use[0]).toMatch(
      /react-runtime-backports-loader\.cjs$/,
    );
  });
  it("does not patch server, development, legacy renderers or lookalike filenames", () => {
    const configure = buildRule();
    expect(
      configure({ module: { rules: [] } }, { isServer: true, dev: false })
        .module.rules,
    ).toHaveLength(0);
    expect(
      configure({ module: { rules: [] } }, { isServer: false, dev: true })
        .module.rules,
    ).toHaveLength(0);
    const rule = configure(
      { module: { rules: [] } },
      { isServer: false, dev: false },
    ).module.rules[0];
    for (const path of [
      "/next/dist/compiled/react-dom/cjs/react-dom-client.development.js",
      "/next/dist/compiled/react-dom/cjs/react-dom.production.js",
      "/next/dist/compiled/react-dom/cjs/react-dom-clientXproductionXjs",
    ])
      expect(matches(rule.test, path)).toBe(false);
  });
});
