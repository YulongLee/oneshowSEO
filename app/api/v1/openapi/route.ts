import { NextResponse } from "next/server";
import { PUBLIC_API_VERSION, publicApiContract, publicResponseHeaders, requestCorrelationId } from "../../../../platform/modules/developer/rest-contract";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  return NextResponse.json(publicApiContract, { headers: { ...publicResponseHeaders(correlationId), "cache-control": "public, max-age=300", "content-type": "application/vnd.oai.openapi+json", "x-api-version": PUBLIC_API_VERSION } });
}
