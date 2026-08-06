import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ObjectStorageProvider, StoredObject } from "../../modules/execution/object-storage";

const keyPattern=/^oneshowseo\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const digest=(body:Uint8Array)=>createHash("sha256").update(body).digest("hex");
export class LocalObjectStorageProvider implements ObjectStorageProvider{
  private readonly root:string;
  constructor(root:string){this.root=resolve(root);if(!this.root||this.root===sep)throw new Error("OBJECT_STORAGE_ROOT_INVALID");}
  private path(key:string){if(!keyPattern.test(key))throw new Error("OBJECT_KEY_INVALID");const target=resolve(this.root,key);if(!target.startsWith(`${this.root}${sep}`))throw new Error("OBJECT_KEY_ESCAPE");return target;}
  async putImmutable(input:{key:string;body:Uint8Array;sha256:string;mimeType:string}):Promise<StoredObject>{if(digest(input.body)!==input.sha256)throw new Error("OBJECT_HASH_MISMATCH");const target=this.path(input.key),parent=target.slice(0,target.lastIndexOf(sep));await mkdir(parent,{recursive:true,mode:0o700});const temporary=`${target}.${randomUUID()}.tmp`;await writeFile(temporary,input.body,{flag:"wx",mode:0o600});try{try{await link(temporary,target);}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;const existing=await readFile(target);if(existing.byteLength!==input.body.byteLength||digest(existing)!==input.sha256)throw new Error("IMMUTABLE_OBJECT_CONFLICT");}}finally{await unlink(temporary).catch(()=>{});}return{key:input.key,sha256:input.sha256,sizeBytes:input.body.byteLength,mimeType:input.mimeType};}
  async read(key:string){return new Uint8Array(await readFile(this.path(key)));}
  async remove(key:string){await unlink(this.path(key)).catch(error=>{if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;});}
  async health(){try{await mkdir(this.root,{recursive:true,mode:0o700});const info=await stat(this.root);return{ok:info.isDirectory(),detail:info.isDirectory()?"ready":"not_directory"};}catch{return{ok:false,detail:"unavailable"};}}
}
