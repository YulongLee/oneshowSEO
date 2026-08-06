import { NextResponse } from "next/server";
import { artifactObjectService } from "../../../../lib/execution";
import { ObjectStorageError } from "../../../../platform/modules/execution/object-storage";

const extension:Record<string,string>={"application/json":"json","application/pdf":"pdf","text/plain":"txt","text/markdown":"md","text/csv":"csv","text/html":"html","image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
export async function GET(request:Request){const token=new URL(request.url).searchParams.get("token")??"";try{const{artifact,body}=await(await artifactObjectService()).resolveAccess(token),filename=`artifact-${artifact.id}.${extension[artifact.mimeType]??"bin"}`;return new NextResponse(body,{headers:{"content-type":artifact.mimeType,"content-length":String(body.byteLength),"content-disposition":`attachment; filename="${filename}"`,"cache-control":"private, no-store, max-age=0","x-content-type-options":"nosniff","content-security-policy":"sandbox"}});}catch(error){if(error instanceof ObjectStorageError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers:{"cache-control":"no-store"}});throw error;}}
