import type { SourceResult } from './types.js';

export function validateCollectionCache(value:unknown,now:string,sourceIds:string[]):SourceResult[] {
  const fail=()=>{throw new Error('CACHE_INVALID_OR_STALE');};
  const end=Date.parse(now); if(!Number.isFinite(end)) return fail();
  const validTime=(value:unknown)=>typeof value==='string' && Number.isFinite(Date.parse(value)) && Date.parse(value)<=end && Date.parse(value)>=end-24*3600_000;
  if(!value || typeof value!=='object') return fail();
  const cache=value as {collectedAt?:unknown;results?:unknown};
  if(!validTime(cache.collectedAt) || !Array.isArray(cache.results)) return fail();
  const allowed=new Set(sourceIds),seen=new Set<string>();
  for(const item of cache.results) {
    if(!item || typeof item!=='object' || typeof item.sourceId!=='string' || !allowed.has(item.sourceId) || seen.has(item.sourceId) || !Array.isArray(item.articles) || !Array.isArray(item.requests)) return fail();
    seen.add(item.sourceId);
    if(item.articles.some((a:Record<string,unknown>)=>!a || a.sourceId!==item.sourceId || !validTime(a.fetchedAt) || a.synthetic!==false) || item.requests.some((r:Record<string,unknown>)=>!r || !validTime(r.fetchedAt))) return fail();
  }
  if(seen.size!==allowed.size) return fail();
  return cache.results as SourceResult[];
}
