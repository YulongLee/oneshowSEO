import { NextResponse } from "next/server";
import { getCurrentUser, writeAudit } from "../../../lib/auth";
import { notificationService } from "../../../lib/notifications";
import { NotificationError } from "../../../platform/modules/notifications";

const noStore={"cache-control":"private, no-store"};
function failure(error:unknown){if(error instanceof NotificationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers:noStore});if(error instanceof Error&&error.message==="NOTIFICATION_RECOVERY_NOT_CONFIGURED")return NextResponse.json({error:"通知恢复服务暂不可用",code:error.message},{status:503,headers:noStore});throw error;}
export async function GET(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401,headers:noStore});try{const limit=Number(new URL(request.url).searchParams.get("limit")||50);return NextResponse.json({notifications:(await notificationService()).list(user.organization.organizationId,user.id,limit)},{headers:noStore});}catch(error){return failure(error);}}
export async function PATCH(request:Request){const user=await getCurrentUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401,headers:noStore});try{const body=await request.json().catch(()=>null) as {id?:unknown}|null,id=typeof body?.id==="string"?body.id:"";if(!id)throw new NotificationError("INVALID_REQUEST","通知编号无效");(await notificationService()).markRead(user.organization.organizationId,user.id,id);await writeAudit("notification_read",user.id,request,JSON.stringify({organizationId:user.organization.organizationId,notificationId:id}));return NextResponse.json({ok:true},{headers:noStore});}catch(error){return failure(error);}}
