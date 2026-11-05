/**
 * Offline J&T L3 ↔ Emsifa v2 deterministic crosswalk.
 * Usage (from frontend/):
 *   node scripts/jnt/reconcile-l3.mjs --preview
 *   JNT_MAPPING_IMPORT_APPROVED=yes node scripts/jnt/reconcile-l3.mjs --stage
 *   JNT_MAPPING_IMPORT_APPROVED=yes JNT_MAPPING_APPROVED_VERSION=<sha> \
 *     JNT_MAPPING_REVIEWER=<id> node scripts/jnt/reconcile-l3.mjs --activate
 * Stage/activate are strictly operator-initiated. No CLI contacts the carrier.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const cwd=process.cwd();
const csvPath=join(cwd,"resources/jnt-l3-official.csv");
const snapshotPath=join(cwd,"src/modules/regions/data/snapshot.json.gz");
const columns=["Provinsi","Kota","Kecamatan","Provinsi JNT","Kota JNT","Kode Kota JNT","Kecamatan JNT","Kode JNT"];
const raw=readFileSync(csvPath,"utf8").replace(/^\uFEFF/,"").replaceAll("\r\n","\n");
export const version=createHash("sha256").update(raw).digest("hex");
export function parseCsv(value) {
  const lines=[];let fields=[],field="",quoted=false;
  for(let i=0;i<value.length;i++){
    const c=value[i];
    if(c==='"') {
      if(quoted && value[i+1]==='"'){field+='"';i++;} else if(quoted){quoted=false;}
      else if(field===""){quoted=true;} else throw Error("Malformed CSV quote");
    } else if(c===","&&!quoted){fields.push(field);field="";}
    else if((c==="\n"||c==="\r")&&!quoted){
      if(c==="\r"&&value[i+1]==="\n")i++;
      fields.push(field);if(fields.some(Boolean))lines.push(fields);
      fields=[];field="";
    } else field+=c;
  }
  if(quoted)throw Error("Unclosed CSV quote");
  if(field||fields.length){fields.push(field);lines.push(fields);}
  return lines;
}
export function normalize(value) {
  return String(value).normalize("NFKD").toUpperCase()
    .replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ")
    .replace(/\s+/g," ").trim();
}
export function cityKey(value) {
  const n=normalize(value);
  if(n.startsWith("KABUPATEN "))return "KAB:"+n.slice(10);
  if(n.startsWith("KAB "))return "KAB:"+n.slice(4);
  if(n.startsWith("KOTA ADMINISTRASI "))return "KOTA:"+n.slice(18);
  if(n.startsWith("KOTA "))return "KOTA:"+n.slice(5);
  return "UNKNOWN:"+n;
}
export function reference() {
  const lists=JSON.parse(gunzipSync(readFileSync(snapshotPath)).toString("utf8"));
  const provinces=lists.provinces?.data||[];
  const byKey=new Map();
  for(const p of provinces){
    for(const c of lists["regencies/"+p.code]?.data||[]){
      for(const d of lists["districts/"+c.code]?.data||[]){
        const key=[normalize(p.name),cityKey(c.name),normalize(d.name)].join("|");
        if(!byKey.has(key))byKey.set(key,[]);
        byKey.get(key).push(d.code);
      }
    }
  }
  return byKey;
}
export function reconcile() {
  const all=parseCsv(raw);
  if(JSON.stringify(all[0])!==JSON.stringify(columns))throw Error("Unexpected J&T L3 header");
  const data=all.slice(1);
  if(data.length!==7128)throw Error("J&T L3 row count changed; independent review needed");
  const districtIndex=reference();
  const codes=new Set();
  const candidates=data.map((r,i)=>{
    if(r.length!==8||r.some(v=>!v.trim()))throw Error("Incomplete J&T row "+(i+2));
    const [province,city,district,jntProvince,jntCity,jntCityCode,jntDistrict,jntAreaCode]=r.map(x=>x.trim());
    if(!/^[A-Z0-9]{3}$/.test(jntCityCode)||!/^[A-Z0-9]{3,10}$/.test(jntAreaCode)||codes.has(jntAreaCode))throw Error("Duplicate/invalid J&T code at row "+(i+2));
    codes.add(jntAreaCode);
    const key=[normalize(province),cityKey(city),normalize(district)].join("|");
    const matches=districtIndex.get(key)||[];
    return {
      id:version+":"+jntAreaCode,version,province,city,district,
      jntProvince,jntCity,jntCityCode,jntDistrict,jntAreaCode,
      emsifaDistrictCode:matches.length===1?matches[0]:null,
      matchStatus:matches.length===1?"EXACT":matches.length?"AMBIGUOUS":"UNMATCHED",
      sourceRow:i+2,approvedAt:null,
    };
  });
  const reverse=new Map();
  for(const r of candidates)if(r.emsifaDistrictCode){
    if(!reverse.has(r.emsifaDistrictCode))reverse.set(r.emsifaDistrictCode,[]);
    reverse.get(r.emsifaDistrictCode).push(r);
  }
  for(const list of reverse.values())if(list.length>1){
    for(const r of list){r.matchStatus="AMBIGUOUS";r.emsifaDistrictCode=null;}
  }
  return candidates;
}
function summary(rows) {
  return {version,rows:rows.length,
    exact:rows.filter(r=>r.matchStatus==="EXACT").length,
    ambiguous:rows.filter(r=>r.matchStatus==="AMBIGUOUS").length,
    unmatched:rows.filter(r=>r.matchStatus==="UNMATCHED").length,
    // Never silently invent an Emsifa mapping.
    sampleUnmatched:rows.filter(r=>r.matchStatus!=="EXACT").slice(0,20).map(r=>({row:r.sourceRow,province:r.province,city:r.city,district:r.district,code:r.jntAreaCode,status:r.matchStatus})),
  };
}
async function main() {
  const args=process.argv.slice(2);
  if(args.length!==1||!["--preview","--stage","--activate"].includes(args[0]))throw Error("Usage: --preview | --stage | --activate");
  const rows=reconcile(), report=summary(rows);
  if(args[0]==="--preview"){
    mkdirSync(join(cwd,".jnt-mapping-report"),{recursive:true});
    writeFileSync(join(cwd,".jnt-mapping-report","report.json"),JSON.stringify(report,null,2));
    writeFileSync(join(cwd,".jnt-mapping-report","unmatched.csv"),
      "sourceRow,province,city,district,jntAreaCode,status\n" +
      rows.filter(row=>row.matchStatus!=="EXACT")
        .map(row=>[row.sourceRow,row.province,row.city,row.district,row.jntAreaCode,row.matchStatus].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n") + "\n");
    console.log(JSON.stringify(report,null,2));return;
  }
  // Stage/activate are explicit, protected write operations. Never run on Preview CI.
  const {assertSafeDatabaseOperation}=await import("../assert-safe-db-operation.mjs");
  assertSafeDatabaseOperation();
  if(process.env.JNT_MAPPING_IMPORT_APPROVED!=="yes"||process.env.VERCEL_ENV==="preview")throw Error("Approval required for mapping database writes");
  const {PrismaClient}=await import("@prisma/client");
  const db=new PrismaClient();
  try {
    if(args[0]==="--stage"){
      if((await db.jntL3Mapping.count({where:{version}}))!==0)throw Error("Version already staged; immutable import");
      const chunks=[];for(let i=0;i<rows.length;i+=500)chunks.push(rows.slice(i,i+500));
      await db.$transaction(async tx=>{
        for(const chunk of chunks)await tx.jntL3Mapping.createMany({data:chunk});
      },{timeout:90000});
      console.log(JSON.stringify(report,null,2));return;
    }
    const reviewer=process.env.JNT_MAPPING_REVIEWER||"";
    if(!/^[A-Za-z0-9_-]{4,128}$/.test(reviewer)||process.env.JNT_MAPPING_APPROVED_VERSION!==version)throw Error("Explicit reviewer and exact version approval required");
    const count=await db.jntL3Mapping.count({where:{version}});
    if(count!==rows.length)throw Error("Staged dataset missing rows");
    const confirmed=await db.jntL3Mapping.count({where:{version,matchStatus:"EXACT",emsifaDistrictCode:{not:null}}});
    if(confirmed<1)throw Error("No exact matches available");
    // Activation publishes *only exact, uniquely matched districts*.
    await db.$transaction(async tx=>{
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`LOCK TABLE "JntL3Mapping" IN SHARE ROW EXCLUSIVE MODE`;
      const staged=await tx.jntL3Mapping.findMany({where:{version},orderBy:{sourceRow:"asc"}});
      // Counts alone cannot prove that a staged code/status/crosswalk was not edited.
      if(staged.length!==rows.length || rows.some((expected,i)=>
        Object.keys(expected).filter(k=>k!=="approvedAt").some(k=>staged[i][k]!==expected[k]))) {
        throw Error("Staged mapping differs from the reviewed official source; activation blocked");
      }
      await tx.jntL3Mapping.updateMany({where:{version,matchStatus:"EXACT",emsifaDistrictCode:{not:null}},data:{approvedAt:new Date()}});
      await tx.jntMappingRelease.upsert({
        where:{key:"primary"},
        create:{key:"primary",activeVersion:version,approvedBy:reviewer},
        update:{activeVersion:version,approvedBy:reviewer,approvedAt:new Date()},
      });
    },{timeout:30000});
    console.log(JSON.stringify({version,active:true,approvedExact:confirmed,unmatched:report.unmatched,ambiguous:report.ambiguous},null,2));
  } finally {await db.$disconnect();}
}
if(process.argv[1]?.endsWith("reconcile-l3.mjs"))main().catch(err=>{console.error(err.message);process.exitCode=1;});
