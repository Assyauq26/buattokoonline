import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const sha = text => createHash('sha256').update(text).digest('hex');
const checksums = JSON.parse(readFileSync(new URL('./braces-checksums.json', import.meta.url), 'utf8'));

// GHSA-vfj7-8cjw-p6xm has no upstream patched release. Keep package version and
// audit severity unchanged; this is a reviewed local mitigation, not an upgrade.
export function prepareBraces({ root = project, verify = false } = {}) {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages).filter(([key]) => /(^|\/)node_modules\/braces$/.test(key));
  if (!entries.length) throw new Error('Review changed braces dependency graph before removing mitigation');
  const pending = [];
  for (const [directory, entry] of entries) {
    if (entry.version !== '3.0.3') throw new Error('Unreviewed braces version');
    for (const [name, checksum] of Object.entries(checksums)) {
      const file = path.join(root, directory, 'lib', name);
      const source = readFileSync(file, 'utf8');
      if (sha(source) === checksum.patched) continue;
      if (verify || sha(source) !== checksum.original) throw new Error(`Unverified braces source: ${directory}/lib/${name}`);
      let patched;
      if (name === 'parse.js') {
        patched = source.replaceAll('      stack.push(block);', "      stack.push(block);\n      if (stack.length > 128) throw new SyntaxError('STORE_BRACES_DEPTH: maximum nesting exceeded');");
      } else {
        const fn = name === 'stringify.js' ? 'stringify' : 'walk';
        patched = source.replace(`const ${fn} = (node, parent = {}) => {`, `const ${fn} = (node, parent = {}, depth = 0) => {\n    if (depth > 128) throw new SyntaxError('STORE_BRACES_DEPTH: maximum nesting exceeded');`);
        patched = fn === 'stringify'
          ? patched.replace('stringify(child);', 'stringify(child, undefined, depth + 1);')
          : patched.replace('walk(child, node);', 'walk(child, node, depth + 1);');
      }
      if (sha(patched) !== checksum.patched) throw new Error('Braces patch checksum mismatch');
      pending.push({ file, patched });
    }
  }
  // Verify all sources before changing any of them. Re-running after a partial
  // filesystem failure is safe because only original/patched checksums pass.
  for (const { file, patched } of pending) writeFileSync(file, patched);
  return { packages: entries.length, changedFiles: pending.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Braces depth mitigation:', prepareBraces({ verify: process.argv.includes('--verify') })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
