import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getLocalObject, putLocalObject, removeLocalObject } from "@/lib/storage-local";
const object = "store/product-images/p1/12345678-1234-1234-1234-123456789abc.png";
let root: string;
let old: string | undefined;
beforeEach(async () => { old=process.env.STORAGE_LOCAL_ROOT; root=await mkdtemp(path.join(tmpdir(),"storage-test-")); process.env.STORAGE_LOCAL_ROOT=root; });
afterEach(async () => { if(old===undefined) delete process.env.STORAGE_LOCAL_ROOT; else process.env.STORAGE_LOCAL_ROOT=old; await rm(root,{recursive:true,force:true}); });
// Production storage is a Linux mount; the Ubuntu VM runs these unconditionally.
describe.skipIf(process.platform === "win32")("private local storage",()=>{
  it("round trips and removes objects without overwriting an existing upload",async()=>{
    const data=new Uint8Array([1,2,3]);
    await putLocalObject(object,"store",data,"image/png");
    await expect(putLocalObject(object,"store",data,"image/png")).rejects.toThrow();
    expect(await getLocalObject(object,"store")).toEqual({data,contentType:"image/png"});
    await removeLocalObject(object,"store");
    await expect(getLocalObject(object,"store")).rejects.toThrow();
    await removeLocalObject(object,"store");
  });
  it("rejects traversal, mismatched types and oversized uploads",async()=>{
    await expect(putLocalObject("../outside","store",new Uint8Array([1]),"image/png")).rejects.toThrow();
    await expect(putLocalObject(object,"store",new Uint8Array([1]),"image/jpeg")).rejects.toThrow();
    await expect(putLocalObject(object,"store",new Uint8Array(4*1024*1024+1),"image/png")).rejects.toThrow();
  });
  it("refuses symlink directories and files",async()=>{
    await symlink(tmpdir(),path.join(root,"store"));
    await expect(putLocalObject(object,"store",new Uint8Array([1]),"image/png")).rejects.toThrow();
    await rm(path.join(root,"store"));
    await mkdir(path.dirname(path.join(root,object)),{recursive:true});
    const sentinel=path.join(root,"sentinel");
    const {writeFile}=await import("node:fs/promises");
    await writeFile(sentinel,"private");
    await symlink(sentinel,path.join(root,object));
    await expect(getLocalObject(object,"store")).rejects.toThrow();
    await expect(removeLocalObject(object,"store")).rejects.toThrow();
    expect(await readFile(sentinel,"utf8")).toBe("private");
  });
});
