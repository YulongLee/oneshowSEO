import { NextResponse } from "next/server";
import { identityService, IdentityError } from "../../../../lib/identity";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    await (await identityService(request)).resetPassword({email:body?.email,code:body?.code,password:body?.password});
    return NextResponse.json({ok:true});
  } catch (error) {
    if (error instanceof IdentityError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    throw error;
  }
}
