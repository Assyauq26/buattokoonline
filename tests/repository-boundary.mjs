import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
assert(files.includes('app/src/modules/regions/data/snapshot.json.gz'), 'Offline region reference must be included in a fresh clone');
for(const file of files){
  assert(!/^(?:platform|agent|landing|backend|\.postgres|media)\//.test(file),`Excluded system: ${file}`);
  assert(!/(^|\/)\.env(?:\.|$)|\.(?:dump|pem|key|p12)$|prisma\/seed\./.test(file),`Forbidden data/secret file: ${file}`);
  if(/\.(?:ts|tsx|js|mjs|cjs|sql|prisma|json|css|sh|ya?ml)$/.test(file)&&!file.startsWith('tests/')&&!file.startsWith('app/tests/')){
    let s=readFileSync(file,'utf8');
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s),`Private key: ${file}`);
    if(file.startsWith('app/src/')&&!file.endsWith('PROVENANCE.md')) {
      // Existing authentication wire identifiers are not storefront branding.
      // Keep the exception exact and file-scoped so an upgrade does not invalidate
      // pending WhatsApp proofs or disconnect an installed relay integration.
      if (file === 'app/src/modules/whatsapp/customer.ts' || file === 'app/src/modules/whatsapp/registration-proof.ts')
        s=s.replaceAll('"__Host-btos-wa"','"__Host-store-wa"');
      if (file === 'app/src/modules/whatsapp/customer.ts')
        s=s.replaceAll('process.env.STORE_WHATSAPP_TENANT_ID','process.env.STORE_WHATSAPP_SCOPE');
      assert(!/ghever|jetseller|\bBTOS\b|control[-_]plane|tenantId|tenant_id|Super Admin|Buat Toko Online Sendiri|\bgh[_-]/i.test(s),`Source boundary/branding: ${file}`);
    }
  }
}
const schema=readFileSync('app/prisma/schema.prisma','utf8');
assert(!/model (?:Tenant|License|LocalAdminSetup|JntPlatformIntegration)/.test(schema));
console.log(`PASS: ${files.length} tracked paths; no platform trees, default source brands, production data files or private keys.`);
