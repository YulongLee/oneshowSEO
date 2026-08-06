import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("API and MCP workspace exposes governed live capabilities without unavailable placeholders",()=>{const ui=readFileSync("app/workspace/ApiMcpCenter.tsx","utf8"),api=readFileSync("app/api/api-access/route.ts","utf8");for(const pattern of [/rotate_key/,/scopes\.join/,/expiresAt/,/rateLimitPolicy/,/WebhooksPage/,/signingSecret/,/retry_webhook/,/MCP Server 已启用/,/2026-07-28/,/start_agent_task/,/返回 429/])assert.match(ui,pattern);assert.doesNotMatch(ui,/MCP 服务端尚未上线/);assert.doesNotMatch(ui,/Webhook 配置模型已经就绪/);assert.match(api,/webhookDelivery:true,mcpServer:true/);assert.match(api,/deliveries/);});
