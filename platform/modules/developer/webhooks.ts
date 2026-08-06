import { createHmac, timingSafeEqual } from "node:crypto";
import { sanitizeIntegrationRecord } from "../integrations/redaction";
export const WEBHOOK_SIGNATURE_VERSION="v1" as const;
export const webhookEvents=["task.created","task.completed","task.failed","approval.required","approval.decided","audit.completed","integration.degraded"] as const;
export type WebhookEventType=(typeof webhookEvents)[number];
export function webhookSignature(secret:string|Uint8Array,timestamp:number,body:string){return`${WEBHOOK_SIGNATURE_VERSION}=${createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex")}`;}
export function verifyWebhookSignature(input:{secret:string|Uint8Array;timestamp:number;body:string;signature:string;now?:number;maxAgeSeconds?:number}){const now=input.now??Math.floor(Date.now()/1000),maxAge=input.maxAgeSeconds??300;if(!Number.isInteger(input.timestamp)||Math.abs(now-input.timestamp)>maxAge)return false;const expected=webhookSignature(input.secret,input.timestamp,input.body),actual=Buffer.from(input.signature),reference=Buffer.from(expected);return actual.length===reference.length&&timingSafeEqual(actual,reference);}
export function validateWebhookEvents(value:unknown):WebhookEventType[]{if(!Array.isArray(value)||value.length<1||value.length>20)throw new Error("INVALID_WEBHOOK_EVENTS");const allowed=new Set(webhookEvents),events=[...new Set(value.map(String))];if(events.some(event=>!allowed.has(event as WebhookEventType)))throw new Error("INVALID_WEBHOOK_EVENTS");return events as WebhookEventType[];}
export function webhookRetry(attempt:number,now:number,maxAttempts=6){if(!Number.isInteger(attempt)||attempt<1)throw new Error("INVALID_WEBHOOK_ATTEMPT");return attempt>=maxAttempts?{state:"quarantined"as const,nextAttemptAt:null}:{state:"retrying"as const,nextAttemptAt:now+Math.min(3600,30*2**(attempt-1))};}
export function safeWebhookPayload(value:unknown){return sanitizeIntegrationRecord(value) as Record<string,unknown>;}
