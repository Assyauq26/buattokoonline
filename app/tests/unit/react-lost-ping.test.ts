import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const patch = require('../../scripts/webpack/react-runtime-backports-loader.cjs').applyRuntimeBackports as (source: string) => string;
const original = readFileSync(require.resolve('next/dist/compiled/react-dom/cjs/react-dom-client.production.js'), 'utf8');

function simulate(source: string, executionContext = 2, exitStatus = 4) {
  const lane = 16384;
  const root = { pingCache: new Map(), pingedLanes: 0, suspendedLanes: 0, warmLanes: lane };
  const context = {
    executionContext, root, lane, workInProgressRoot: root,
    workInProgressRootRenderLanes: lane, workInProgressRootExitStatus: exitStatus,
    workInProgressRootPingedLanes: 0, workInProgressSuspendedRetryLanes: 0,
    globalMostRecentFallbackTime: 0, now: () => 1000, restarts: 0, schedules: 0,
    prepareFreshStack: () => { context.restarts++; },
    ensureRootIsScheduled: () => { context.schedules++; },
  };
  // Exercise the actual installed runtime function, followed by the lane
  // exclusion used by markRootSuspended. No mocked copy of the function.
  const start = source.indexOf('function pingSuspendedRoot(');
  const end = source.indexOf('function retryTimedOutBoundary(', start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  vm.runInNewContext(source.slice(start, end) + '\npingSuspendedRoot(root, {}, lane); root.suspendedLanes |= lane & ~workInProgressRootPingedLanes;', context, { timeout: 1000 });
  return context;
}

describe('React render-time wakeable ping backport', () => {
  it('demonstrates the original lost ping on the pinned runtime', () => {
    const state = simulate(original);
    expect(state.workInProgressRootPingedLanes).toBe(0);
    expect(state.root.suspendedLanes).toBe(state.lane);
  });
  it('keeps resolved data eligible for retry when the root cannot restart during render', () => {
    const state = simulate(patch(original));
    expect(state.workInProgressRootPingedLanes).toBe(state.lane);
    expect(state.root.suspendedLanes).toBe(0);
    expect(state.restarts).toBe(0); expect(state.schedules).toBe(1);
  });
  it('preserves the fresh-stack restart outside render', () => {
    const state = simulate(patch(original), 0);
    expect(state.restarts).toBe(1); expect(state.schedules).toBe(1);
  });
  it('preserves the ordinary ping branch', () => {
    const state = simulate(patch(original), 2, 0);
    expect(state.workInProgressRootPingedLanes).toBe(state.lane);
    expect(state.root.suspendedLanes).toBe(0);
  });
  it('rejects changed or already patched dependency sources', () => {
    expect(() => patch(original + '\n')).toThrow(/runtime changed/);
    expect(() => patch(patch(original))).toThrow(/runtime changed/);
  });
});
