// Portions copyright Meta Platforms, Inc. and affiliates.
// MIT license: react-backports.LICENSE.
const { createHash } = require('node:crypto');

// Backport facebook/react#36134 (MIT), commit
// c0d218f0f3e02ed581f74096e56baa947213135d. Next 15.5.26 bundles a
// React canary that can lose a resolved wakeable's ping during render.
// Keep the original fresh-stack behavior and record the ping if restarting
// is currently unsafe. No navigation, timing, or hydration policy is changed.
const SOURCE_SHA256 = '9bcaacd92279559075407d2fb09b19893f03f9b93ad74eb0ef42b31b66f6053e';
const BEFORE = '      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)';
const AFTER = '      ? (0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))';

function applyRuntimeBackports(source) {
  if (typeof source !== 'string' || createHash('sha256').update(source).digest('hex') !== SOURCE_SHA256) {
    throw new Error('React lost-ping backport: runtime changed; review upstream fix and remove or revalidate this backport before building.');
  }
  if (source.split(BEFORE).length !== 2) throw new Error('React lost-ping backport: expected exactly one render-time ping branch.');
  const replayBefore = '    case 5:\n      resetHooksOnUnwind(next);';
  const replayAfter = replayBefore + '\n      popHydrationStateOnInterruptedWork(next);';
  const reset = 'function resetHydrationState() {';
  if (source.split(replayBefore).length !== 2 || source.split(reset).length !== 2) throw new Error('React hydration replay backport: expected one HostComponent replay branch and hydration reset.');
  // Backport facebook/react#35494 (MIT), commit
  // c18662405cc4. A HostComponent replay must reclaim its own DOM node,
  // rather than trying to hydrate its child cursor as the host itself.
  const restore = `function popHydrationStateOnInterruptedWork(fiber) {
  if (fiber !== hydrationParentFiber) return;
  if (!isHydrating) {
    popToNextHostParent(fiber);
    isHydrating = !0;
    return;
  }
  popToNextHostParent(fiber);
  if (5 === fiber.tag && null != fiber.stateNode)
    nextHydratableInstance = fiber.stateNode;
}
`;
  return source.replace(BEFORE, AFTER).replace(replayBefore, replayAfter).replace(reset, restore + reset);
}

module.exports = applyRuntimeBackports;
module.exports.applyRuntimeBackports = applyRuntimeBackports;
