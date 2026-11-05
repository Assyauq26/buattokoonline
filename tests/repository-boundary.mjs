import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){
  assert(!/^(?:platform|agent|landing|backend|\.postgres|media)\//.test(file),`Excluded system: ${file}`);
  assert(!/(^|\/)\.env(?:\.|$)|\.(?:dump|pem|key|p12)$|prisma\/seed\./.test(file),`Forbidden data/secret file: ${file}`);
  if(/\.(?:ts|tsx|js|mjs|cjs|sql|prisma|json|css|sh|ya?ml)$/.test(file)&&!file.startsWith('tests/')&&!file.startsWith('app/tests/')){
    const s=readFileSync(file,'utf8');
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s),`Private key: ${file}`);
    if(file.startsWith('app/src/')&&!file.endsWith('PROVENANCE.md')) {
      assert(!/gheverhan|jetseller|\bBTOS\b|control[-_]plane|tenantId|tenant_id|Super Admin|Buat Toko Online Sendiri/i.test(s),`Source boundary/branding: ${file}`);
    }
  }
}
const schema=readFileSync('app/prisma/schema.prisma','utf8');
assert(!/model (?:Tenant|License|LocalAdminSetup|JntPlatformIntegration)/.test(schema));
console.log(`PASS: ${files.length} tracked paths; no platform trees, default source brands, production data files or private keys.`);
