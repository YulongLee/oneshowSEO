import { NextResponse } from "next/server";
import { ensureBillingSchema, sandboxPaymentService } from "../../../../../lib/billing";
import { PaymentError } from "../../../../../platform/modules/commerce/payments";

export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}){
  const{provider}=await params;if(provider!=="sandbox")return NextResponse.json({error:"支付提供商不存在",code:"PAYMENT_PROVIDER_NOT_FOUND"},{status:404});
  await ensureBillingSchema();const service=sandboxPaymentService();if(!service)return NextResponse.json({error:"支付沙箱未启用",code:"PAYMENT_SANDBOX_DISABLED"},{status:503});
  const signature=request.headers.get("x-payment-signature")??"",length=Number(request.headers.get("content-length")??0);if(length>1_048_576)return NextResponse.json({error:"事件载荷过大",code:"PAYLOAD_TOO_LARGE"},{status:413});
  const rawBody=await request.text();if(Buffer.byteLength(rawBody)>1_048_576)return NextResponse.json({error:"事件载荷过大",code:"PAYLOAD_TOO_LARGE"},{status:413});
  try{const result=service.receiveWebhook(rawBody,signature);return NextResponse.json({accepted:true,duplicate:result.duplicate,eventId:result.record.providerEventId,state:result.record.state},{status:result.duplicate?200:202});}
  catch(error){if(error instanceof PaymentError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});return NextResponse.json({error:"支付事件签名或载荷无效",code:"PAYMENT_WEBHOOK_INVALID"},{status:400});}
}
