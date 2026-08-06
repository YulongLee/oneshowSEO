import assert from "node:assert/strict";
import test from "node:test";
import { developerScopes, nextPageCursor, parsePage, publicApiContract, publicErrorCodes, publicFailure, publicResponseHeaders, publicSuccess, requestCorrelationId, validIdempotencyKey } from "../platform/modules/developer/rest-contract";
import { GET as openApi } from "../app/api/v1/openapi/route";

test("public REST contract publishes version, scopes, errors, and lifecycle policies", async () => {
  assert.equal(publicApiContract.openapi,"3.1.0");
  assert.equal(new Set(developerScopes).size,developerScopes.length);
  assert.ok(publicErrorCodes.includes("IDEMPOTENCY_CONFLICT"));
  assert.match(publicApiContract["x-oneshowseo-policies"].deprecation,/180 days/);
  assert.match(publicApiContract["x-oneshowseo-policies"].idempotency,/Equivalent retries/);
  const response=await openApi(new Request("https://oneshowseo.com/api/v1/openapi",{headers:{"x-correlation-id":"client:request:0001"}}));
  assert.equal(response.status,200);assert.equal(response.headers.get("x-correlation-id"),"client:request:0001");assert.match(response.headers.get("content-type")||"",/openapi\+json/);
});

test("public envelopes preserve safe correlation and stable machine errors", () => {
  const request=new Request("https://oneshowseo.com/api/v1/projects",{headers:{"x-correlation-id":"request:valid:0001"}}),correlationId=requestCorrelationId(request);
  assert.deepEqual(publicSuccess(correlationId,{id:"project_a"}),{ok:true,apiVersion:"v1",correlationId:"request:valid:0001",data:{id:"project_a"}});
  assert.equal(publicFailure(correlationId,"RATE_LIMITED","Try later",true,{retryAfterSeconds:10}).error.retryAfterSeconds,10);
  const headers=publicResponseHeaders(correlationId) as Record<string,string>;
  assert.equal(headers["x-correlation-id"],correlationId);
  assert.match(requestCorrelationId(new Request("https://oneshowseo.com",{headers:{"x-correlation-id":"bad value"}})),/^req_/);
});

test("pagination is opaque and bounded while invalid cursors fail before reads", () => {
  assert.deepEqual(parsePage("https://oneshowseo.com/api/v1/projects?limit=500"),{offset:0,limit:100});
  const cursor=nextPageCursor(0,25,25)!;
  assert.deepEqual(parsePage(`https://oneshowseo.com/api/v1/projects?cursor=${cursor}&limit=25`),{offset:25,limit:25});
  assert.throws(()=>parsePage("https://oneshowseo.com/api/v1/projects?cursor=invalid"),/INVALID_CURSOR/);
  assert.equal(nextPageCursor(0,25,3),null);
  assert.equal(validIdempotencyKey("task:create:0001"),true);
  assert.equal(validIdempotencyKey("short"),false);
});

test("v1 discovery remains backward compatible for published resources and machine contracts",()=>{
 assert.equal(publicApiContract.info.version,"2026-08-06");
 assert.deepEqual(Object.keys(publicApiContract.paths),["/projects","/projects/{id}"]);
 assert.equal(publicApiContract.paths["/projects"].get.operationId,"listProjects");
 assert.equal(publicApiContract.paths["/projects/{id}"].get.operationId,"getProject");
 assert.deepEqual(publicApiContract.security,[{bearerApiKey:[]}]);
 assert.ok(publicErrorCodes.includes("NOT_FOUND"));
 assert.ok(developerScopes.includes("projects:read"));
});
