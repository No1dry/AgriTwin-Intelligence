import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { collectExternalSources } from '../lib/external/collectors.js';
import { EXTERNAL_SOURCES } from '../lib/external/sources.js';
import { generateExternalBrief, renderBriefMarkdown, validateExternalBrief } from '../lib/external/brief.js';
import type { SourceResult } from '../lib/external/types.js';
import { validateCollectionCache } from '../lib/external/cache.js';

async function main() {
  const args=process.argv.slice(2); const mode=args.includes('--live')?'live':'collect';
  if(args.some(arg=>!['--live','--from-cache'].includes(arg))) throw new Error('Usage: external-brief.ts [--live] [--from-cache]');
  if(mode==='live' && !process.env.MOONSHOT_API_KEY) throw new Error('MOONSHOT_API_KEY_MISSING');
  const now=new Date().toISOString(); const root=path.resolve('artifacts/external'); await mkdir(root,{recursive:true});
  let results:SourceResult[];
  if(args.includes('--from-cache')) {
    const cache=JSON.parse(await readFile(path.join(root,'collection.json'),'utf8'));
    results=validateCollectionCache(cache,now,EXTERNAL_SOURCES.map(source=>source.id));
  } else {
    results=await collectExternalSources({now});
    await writeFile(path.join(root,'collection.json'),JSON.stringify({collectedAt:now,results},null,2)+'\n');
  }
  const workflowUrl=process.env.GITHUB_RUN_ID?`https://github.com/No1dry/AgriTwin-Intelligence/actions/runs/${process.env.GITHUB_RUN_ID}`:undefined;
  const brief=await generateExternalBrief(results,EXTERNAL_SOURCES,{now,mode,apiKey:process.env.MOONSHOT_API_KEY,workflowUrl});
  validateExternalBrief(brief);
  const publicPath=path.resolve('public/external'); await mkdir(publicPath,{recursive:true});
  const output=JSON.stringify(brief,null,2)+'\n';
  await writeFile(path.join(root,'latest.json'),output);
  await writeFile(path.join(root,'brief.md'),renderBriefMarkdown(brief));
  // Public output contains short excerpts, model summaries and diagnostics, never full source responses.
  await writeFile(path.join(publicPath,'latest.json.tmp'),output); await rename(path.join(publicPath,'latest.json.tmp'),path.join(publicPath,'latest.json'));
  await writeFile(path.join(publicPath,'brief.md'),renderBriefMarkdown(brief));
  if(process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,'public_ready=true\n',{flag:'a'});
  console.log(JSON.stringify({mode,articles:brief.articles.length,model:brief.modelRun,sources:brief.sources.map(s=>({id:s.id,status:s.status,count:s.articleCount,reason:s.reason}))},null,2));
  if(process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,renderBriefMarkdown(brief),{flag:'a'});
  if(!brief.articles.length || mode==='live' && brief.modelRun.status==='failed') process.exitCode=1;
}
main().catch(error=> {console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message)?error.message:'EXTERNAL_BRIEF_FAILED'); process.exitCode=1;});
