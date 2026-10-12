import { createHash } from 'node:crypto';
import type { SourceResult } from './types.js';
export const MAX_RESPONSE_BYTES = 1_500_000;
export const USER_AGENT = 'AgriTwinResearch/1.0 (+https://github.com/No1dry/AgriTwin-Intelligence)';
export const hashText = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export class SourceError extends Error { constructor(public code: string) { super(code); this.name='SourceError'; } }
export interface HttpResult { url:string; status:number; text:string; hash:string; fetchedAt:string; bytes:number }
export interface HttpOptions { fetch?:typeof fetch; clock?:()=>string; timeoutMs?:number; minIntervalMs?:number; maxRequests?:number; sleep?:(ms:number)=>Promise<void> }
export function safeRequestUrl(value:string):string {
 const url=new URL(value); for(const key of [...url.searchParams.keys()]) if(/key|token|secret|signature|jwt/i.test(key)) url.searchParams.delete(key); return url.href;
}
function checkedUrl(value:string,hosts:readonly string[]):URL {
 const url=new URL(value); if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' || !hosts.includes(url.hostname)) throw new SourceError('URL_NOT_ALLOWED'); return url;
}
export function decodeResponse(bytes:Uint8Array,contentType:string):string {
 const prefix=new TextDecoder('ascii').decode(bytes.subarray(0,4096));
 const charset=prefix.match(/charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)/i)?.[1] ?? contentType.match(/charset\s*=\s*([a-zA-Z0-9_-]+)/i)?.[1] ?? 'utf-8';
 try {return new TextDecoder(charset).decode(bytes);} catch {throw new SourceError('UNSUPPORTED_CHARSET');}
}
export function createSourceHttp(hosts:readonly string[],requests:SourceResult['requests'],options:HttpOptions={}) {
 let attempts=0,lastStart=0;
 const timeout=Math.min(15000,Math.max(1,options.timeoutMs??15000));
 const sleeper=options.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 return async(input:string,headers:Record<string,string>={}):Promise<HttpResult>=>{
  const original=checkedUrl(input,hosts); let next=original.href;
  for(let redirects=0;redirects<=2;redirects++) {
   if(++attempts>Math.min(8,options.maxRequests??6)) throw new SourceError('REQUEST_BUDGET_EXHAUSTED');
   checkedUrl(next,hosts); const requestUrl=next;
   const wait=(options.minIntervalMs??1000)-(Date.now()-lastStart); if(wait>0) await sleeper(wait); lastStart=Date.now();
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
   let status:number|null=null,responseHash='',size=0;
   try {
    const response=await(options.fetch??fetch)(requestUrl,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'User-Agent':USER_AGENT,Accept:'text/html,application/json,application/atom+xml;q=0.9,*/*;q=0.5',...headers}});
    status=response.status; const reader=response.body?.getReader(),chunks:Uint8Array[]=[];
    if(Number(response.headers.get('content-length'))>MAX_RESPONSE_BYTES){await reader?.cancel();throw new SourceError('RESPONSE_TOO_LARGE');}
    if(reader) while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw new SourceError('RESPONSE_TOO_LARGE');}chunks.push(chunk.value);}
    const bytes=Buffer.concat(chunks);responseHash=hashText(bytes);
    if(status>=300&&status<400){const location=response.headers.get('location');if(!location||redirects===2)throw new SourceError('REDIRECT_LIMIT');const target=checkedUrl(new URL(location,requestUrl).href,hosts);if(target.origin!==original.origin)throw new SourceError('CROSS_ORIGIN_REDIRECT');next=target.href;continue;}
    return{url:safeRequestUrl(requestUrl),status,text:decodeResponse(bytes,response.headers.get('content-type')??''),hash:responseHash,fetchedAt:(options.clock??(()=>new Date().toISOString()))(),bytes:size};
   }catch(error){if(error instanceof SourceError)throw error;const code=(error as {cause?:{code?:unknown}})?.cause?.code;const known=typeof code==='string'&&['ENOTFOUND','ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code);throw new SourceError(controller.signal.aborted?'HTTP_TIMEOUT':known?`HTTP_NETWORK_${code}`:'HTTP_NETWORK_ERROR');}
   finally{clearTimeout(timer);requests.push({url:safeRequestUrl(requestUrl),status,fetchedAt:(options.clock??(()=>new Date().toISOString()))(),responseHash,bytes:size});}
  }
  throw new SourceError('REDIRECT_LIMIT');
 };
}
export function robotsAllows(robots:string,url:string):boolean {
 type Rule={allow:boolean;path:string};type Group={agents:string[];rules:Rule[]};
 const groups:Group[]=[];let group:Group={agents:[],rules:[]},hasRules=false;
 for(const raw of robots.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;const key=m[1].toLowerCase(),value=m[2].trim();if(key==='user-agent'){if(hasRules){groups.push(group);group={agents:[],rules:[]};hasRules=false;}group.agents.push(value.toLowerCase());}else if((key==='allow'||key==='disallow')&&group.agents.length){hasRules=true;if(value)group.rules.push({allow:key==='allow',path:value});}}
 groups.push(group);const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&USER_AGENT.toLowerCase().includes(a)));const relevant=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const target=new URL(url).pathname+new URL(url).search;
 const matches=relevant.flatMap(g=>g.rules).filter(rule=>{const end=rule.path.endsWith('$');const p=end?rule.path.slice(0,-1):rule.path;const pattern=p.split('*').map(s=>s.replace(/[|\\{}()[\]^$+?.]/g,'\\$&')).join('.*');return new RegExp('^'+pattern+(end?'$':'')).test(target);}).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));return matches[0]?.allow??true;
}
