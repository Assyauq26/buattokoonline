import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareBraces } from '../../scripts/security/prepare-braces.mjs';
const require = createRequire(import.meta.url);
const braces = require('braces');
const deep = '{'.repeat(4000) + 'x' + '}'.repeat(4000);
const denied = error => error instanceof SyntaxError && error.message.includes('STORE_BRACES_DEPTH');
for (const method of ['parse', 'compile', 'expand', 'stringify']) {
  test(`${method} rejects deeply nested patterns with a controlled depth error`, () => {
    assert.throws(() => braces[method](deep), denied);
    assert.throws(() => braces[method]('('.repeat(4000) + 'x' + ')'.repeat(4000)), denied);
  });
}
for (const method of ['compile', 'expand', 'stringify']) {
  test(`${method} also bounds caller-supplied AST traversal`, () => {
    let ast = { type: 'text', value: 'x' };
    for (let i = 0; i < 5000; i++) ast = { type: 'root', nodes: [ast] };
    assert.throws(() => braces[method](ast), denied);
  });
}
test('normal nested globs, ranges, escaping and micromatch retain behavior', () => {
  assert.equal(braces.compile('./src/**/*.{ts,tsx}'), './src/**/*.(ts|tsx)');
  assert.deepEqual(braces.expand('a/{b,{c,d}}/{1..2}'), ['a/b/1','a/b/2','a/c/1','a/c/2','a/d/1','a/d/2']);
  assert.deepEqual(braces.expand('a/\\{b,c\\}'), ['a/{b,c}']);
  assert.deepEqual(require('micromatch')(['src/a.ts','src/a.tsx','src/a.css'], './src/**/*.{ts,tsx}'), ['src/a.ts','src/a.tsx']);
});
test('all installed brace copies are guarded and unknown source fails closed', () => {
  assert.equal(prepareBraces({ verify: true }).changedFiles, 0);
  const root = mkdtempSync(path.join(tmpdir(), 'braces-guard-'));
  try {
    const target = path.join(root, 'node_modules/braces'); mkdirSync(target, {recursive:true});
    cpSync(path.dirname(require.resolve('braces/package.json')), target, {recursive:true});
    writeFileSync(path.join(root,'package-lock.json'), JSON.stringify({packages:{'node_modules/braces':{version:'3.0.3'}}}));
    assert.equal(prepareBraces({root}).changedFiles,0);
    const file=path.join(target,'lib/compile.js'); const changed=readFileSync(file,'utf8')+'\n// unexpected\n';writeFileSync(file,changed);
    assert.throws(()=>prepareBraces({root}),/Unverified braces source/);
    assert.equal(readFileSync(file,'utf8'),changed);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
