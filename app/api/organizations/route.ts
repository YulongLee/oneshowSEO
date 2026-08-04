import { NextResponse } from "next/server";
import { getCurrentUser, getDatabase, setSessionCookie } from "../../../lib/auth";
import { currentSessionToken, identityService, IdentityError } from "../../../lib/identity";
import { SqliteTenancyRepository } from "../../../platform/adapters/sqlite/tenancy-repository";
import { TenancyError, TenancyService } from "../../../platform/modules/identity/tenancy";

const errorResponse = (error: unknown) => {
  if (error instanceof IdentityError || error instanceof TenancyError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
  throw error;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录",code:"UNAUTHENTICATED"},{status:401});
  const organizations = await new TenancyService(new SqliteTenancyRepository(getDatabase())).list(user.id);
  return NextResponse.json({organizations,activeOrganizationId:user.organization.organizationId});
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录",code:"UNAUTHENTICATED"},{status:401});
  const body = await request.json().catch(()=>null) as Record<string,unknown>|null;
  try {
    const organization = await new TenancyService(new SqliteTenancyRepository(getDatabase())).create({userId:user.id,name:body?.name,locale:body?.locale,timezone:body?.timezone});
    const session = await (await identityService(request)).switchOrganization({accountId:user.id,organizationId:organization.organizationId,previousToken:await currentSessionToken()});
    await setSessionCookie(session.token,session.expiresAt);
    return NextResponse.json({organization,activeOrganizationId:organization.organizationId},{status:201});
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:"请先登录",code:"UNAUTHENTICATED"},{status:401});
  const body = await request.json().catch(()=>null) as Record<string,unknown>|null;
  try {
    const session = await (await identityService(request)).switchOrganization({accountId:user.id,organizationId:body?.organizationId,previousToken:await currentSessionToken()});
    await setSessionCookie(session.token,session.expiresAt);
    return NextResponse.json({ok:true,activeOrganizationId:session.organization.organizationId});
  } catch (error) { return errorResponse(error); }
}
