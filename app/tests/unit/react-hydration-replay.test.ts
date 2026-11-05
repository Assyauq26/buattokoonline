import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const patch = require('../../scripts/webpack/react-runtime-backports-loader.cjs').applyRuntimeBackports as (source: string) => string;
const original = readFileSync(require.resolve('next/dist/compiled/react-dom/cjs/react-dom-client.production.js'), 'utf8');
function select(source: string, start: string, end: string) {
  const a = source.indexOf(`function ${start}(`); const b = source.indexOf(`function ${end}(`, a);
  expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a); return source.slice(a, b);
}
function fixture(source: string) {
  const main: { nodeType: number; nodeName: string; data?: string } = { nodeType: 1, nodeName: 'MAIN' };
  const boundary = { nodeType: 8, nodeName: '#comment', data: '$~' };
  const parent = { tag: 5, return: null };
  const host = { tag: 5, stateNode: main, return: parent, alternate: null, pendingProps: {} };
  const context = {
    host, main, boundary, hydrationParentFiber: host, nextHydratableInstance: boundary as typeof main,
    isHydrating: true, rootOrSingletonContext: false, entangledRenderLanes: 16384, workInProgress: null,
    resetHooksOnUnwind: () => {}, unwindInterruptedWork: () => {},
    resetWorkInProgress: (fiber: typeof host) => fiber,
    beginWork: (_current: unknown, fiber: typeof host) => {
      if (context.nextHydratableInstance !== fiber.stateNode) throw new Error('Hydration cursor points to the child instead of the already claimed MAIN');
      context.hydrationParentFiber = fiber; context.nextHydratableInstance = boundary;
      return { tag: 13 };
    },
    completeUnitOfWork: () => {},
  };
  const restore = source.includes('function popHydrationStateOnInterruptedWork(')
    ? select(source, 'popHydrationStateOnInterruptedWork', 'resetHydrationState') : '';
  const code = select(source, 'popToNextHostParent', 'popHydrationState') + restore
    + select(source, 'replaySuspendedUnitOfWork', 'throwAndUnwindWorkLoop');
  return { context, code };
}
describe('hydrating a HostComponent after its lazy Flight child resolves', () => {
  it('reproduces the wrong child cursor in the unpatched runtime replay', () => {
    const { context, code } = fixture(original);
    expect(() => vm.runInNewContext(code + '\nreplaySuspendedUnitOfWork(host);', context)).toThrow(/cursor points to the child/);
  });
  it('reclaims the same MAIN node before replaying beginWork', () => {
    const { context, code } = fixture(patch(original));
    expect(() => vm.runInNewContext(code + '\nreplaySuspendedUnitOfWork(host);', context)).not.toThrow();
    expect(context.hydrationParentFiber).toBe(context.host);
    expect(context.nextHydratableInstance).toBe(context.boundary);
  });
  it('leaves a deeper inserted tree cursor unchanged', () => {
    const { context, code } = fixture(patch(original));
    vm.runInNewContext(code + '\npopHydrationStateOnInterruptedWork({tag:5, stateNode:{}});', context);
    expect(context.nextHydratableInstance).toBe(context.boundary);
    expect(context.hydrationParentFiber).toBe(context.host);
  });
  it('reenters hydration after an insertion without rewriting the sibling cursor', () => {
    const { context, code } = fixture(patch(original)); context.isHydrating = false;
    vm.runInNewContext(code + '\npopHydrationStateOnInterruptedWork(host);', context);
    expect(context.isHydrating).toBe(true);
    expect(context.hydrationParentFiber).toBe(context.host.return);
    expect(context.nextHydratableInstance).toBe(context.boundary);
  });
});
