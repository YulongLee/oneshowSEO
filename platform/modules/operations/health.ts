export type DependencyState="ready"|"degraded"|"unavailable"|"not_configured";
export type DependencyHealth={name:"sqlite"|"postgres"|"workers"|"object_storage"|"email"|"billing"|"providers";state:DependencyState;required:boolean;latencyMs:number|null;code:string;checkedAt:number;detail?:Record<string,number|string|boolean|null>};
export type Readiness={state:"ready"|"degraded"|"unready";ready:boolean;checkedAt:number;dependencies:DependencyHealth[]};
export function readiness(dependencies:DependencyHealth[],checkedAt=Math.floor(Date.now()/1000)):Readiness{const blocking=dependencies.some(item=>item.required&&item.state!=="ready"),degraded=dependencies.some(item=>!item.required&&item.state!=="ready");return{state:blocking?"unready":degraded?"degraded":"ready",ready:!blocking,checkedAt,dependencies};}
export function dependency(input:DependencyHealth){if(!input.code||!/^[A-Z0-9_]{2,80}$/.test(input.code))throw new Error("INVALID_HEALTH_CODE");return input;}
