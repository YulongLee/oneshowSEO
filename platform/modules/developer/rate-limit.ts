export const DEVELOPER_RATE_POLICY_VERSION="developer-rate-v1" as const;
export type RateDimension="credential"|"organization"|"project"|"endpoint"|"cost";
export type RateBucketRequest={dimension:RateDimension;subjectId:string;organizationId:string;projectId:string;endpoint:string;bucketStart:number;windowSeconds:number;requestLimit:number;costLimit:number;cost:number};
export type RateBucketResult={allowed:boolean;dimension:RateDimension;requestCount:number;costUnits:number;requestLimit:number;costLimit:number};
export interface DistributedRateLimitRepository{consume(requests:RateBucketRequest[]):Promise<RateBucketResult[]>;}
export type DeveloperRateInput={credentialId:string;organizationId:string;projectId:string|null;endpoint:string;cost:number;credentialRequestsPerMinute:number;credentialCostUnitsPerMinute:number;organizationRequestsPerMinute:number;projectRequestsPerMinute:number;endpointRequestsPerMinute:number;now?:number};
export type DeveloperRateDecision={allowed:boolean;policyVersion:typeof DEVELOPER_RATE_POLICY_VERSION;retryAfterSeconds:number|null;resetsAt:number;limitedBy:RateDimension|null;limits:Record<RateDimension,{requests:number;cost:number}>};

export class DeveloperRateLimitService{
 constructor(private readonly repository:DistributedRateLimitRepository){}
 async consume(input:DeveloperRateInput):Promise<DeveloperRateDecision>{
  const now=input.now??Math.floor(Date.now()/1000),windowSeconds=60,bucketStart=Math.floor(now/windowSeconds)*windowSeconds,projectId=input.projectId??"*",safeEndpoint=input.endpoint.replace(/[^A-Za-z0-9._:/-]/g,"").slice(0,160)||"unknown",cost=Math.floor(input.cost);
  if(!input.credentialId||!input.organizationId||!Number.isInteger(cost)||cost<1||cost>10000)throw new Error("INVALID_RATE_LIMIT_INPUT");
  const unlimited=9_000_000_000_000_000,dimensions:Array<[RateDimension,string,number,number,string,string]>=[["credential",input.credentialId,input.credentialRequestsPerMinute,unlimited,"*","*"],["organization",input.organizationId,input.organizationRequestsPerMinute,unlimited,"*","*"],["project",projectId,input.projectRequestsPerMinute,unlimited,projectId,"*"],["endpoint",`${input.organizationId}:${safeEndpoint}`,input.endpointRequestsPerMinute,unlimited,"*",safeEndpoint],["cost",input.credentialId,unlimited,input.credentialCostUnitsPerMinute,"*","*"]];
  const requests=dimensions.map(([dimension,subjectId,requestLimit,costLimit,scopeProject,scopeEndpoint])=>({dimension,subjectId,organizationId:input.organizationId,projectId:scopeProject,endpoint:scopeEndpoint,bucketStart,windowSeconds,requestLimit:Math.max(1,Math.floor(requestLimit)),costLimit:Math.max(1,Math.floor(costLimit)),cost}));const results=await this.repository.consume(requests),limited=results.find(value=>!value.allowed);const limits=Object.fromEntries(results.map(value=>[value.dimension,{requests:value.requestLimit,cost:value.costLimit}])) as DeveloperRateDecision["limits"];return{allowed:!limited,policyVersion:DEVELOPER_RATE_POLICY_VERSION,retryAfterSeconds:limited?Math.max(1,bucketStart+windowSeconds-now):null,resetsAt:bucketStart+windowSeconds,limitedBy:limited?.dimension??null,limits};
 }
}

export class MemoryDistributedRateLimitRepository implements DistributedRateLimitRepository{
 private readonly buckets=new Map<string,{requests:number;cost:number}>();
 async consume(requests:RateBucketRequest[]){const next=requests.map(request=>{const key=[request.dimension,request.subjectId,request.projectId,request.endpoint,request.bucketStart,request.windowSeconds].join("|"),current=this.buckets.get(key)??{requests:0,cost:0};return{request,key,current,value:{requests:current.requests+1,cost:current.cost+request.cost}};});const denied=next.find(item=>item.value.requests>item.request.requestLimit||item.value.cost>item.request.costLimit);if(!denied)for(const item of next)this.buckets.set(item.key,item.value);return next.map(item=>({allowed:item!==denied,dimension:item.request.dimension,requestCount:item.value.requests,costUnits:item.value.cost,requestLimit:item.request.requestLimit,costLimit:item.request.costLimit}));}
}
