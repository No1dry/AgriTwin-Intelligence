import * as cheerio from 'cheerio';
import { COLLECTOR_SOURCES, type CollectorSource } from './sources.js';
import { createSourceHttp, hashText, robotsAllows, SourceError, type HttpOptions, type HttpResult } from './http.js';
import type { ExternalArticle, SourceResult } from './types.js';
const AGRICULTURE=/农业|农田|农技|涉农|水产|养殖|池塘|稻|鱼|渔|鳖|作物|土壤|粮食|病虫|墒情|灌溉|耕地|遥感|农机|防汛|水位|水雨|气象|干旱|降雨|预警|天气|aquacultur|agricultur|crop|rice|fish|soil|irrigat|drought|farming/i;
const IRRELEVANT=/党建|巡察|纪检|干部任免|招聘|招标公告|采购公告|学习贯彻|党组|廉政|主题教育/;
const clean=(s:string)=>s.replace(/\s+/gu,' ').trim();
const limit=(s:string,n:number)=>[...s].slice(0,n).join('');
export function isAgricultural(title:string,content=''){return !IRRELEVANT.test(title)&&AGRICULTURE.test(`${title} ${content}`);}
export function publicationDate(input:string|null|undefined):Pick<ExternalArticle,'publishedAt'|'publishedDate'|'datePrecision'>{
 const value=input?.trim()??'',m=value.match(/(20\d{2})\s*[年\/.\-]\s*(\d{1,2})\s*[月\/.\-]\s*(\d{1,2})/);
 if(!m)return{publishedAt:null,publishedDate:null,datePrecision:'unknown'};
 const date=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return{publishedAt:null,publishedDate:null,datePrecision:'unknown'};
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)))return{publishedAt:value,publishedDate:date,datePrecision:'datetime'};
 return{publishedAt:null,publishedDate:date,datePrecision:'date'};
}
function article(source:CollectorSource,response:HttpResult,title:string,url:string,content:string,published:string|null,limitations:string[]=[]):ExternalArticle{
 const value=limit(clean(content),16000),dates=publicationDate(published);
 return{id:`ext-${hashText(`${source.id}\n${url}\n${value}`).slice(0,20)}`,sourceId:source.id,sourceName:source.name,category:source.category,title:clean(title),url,content:value,...dates,fetchedAt:response.fetchedAt,responseHash:response.hash,contentHash:hashText(value),synthetic:false,
 limitations:[...limitations,...(dates.datePrecision==='unknown'?['未识别可靠发布日期，采集时间不作为发布时间。']:dates.datePrecision==='date'?['发布日期仅精确到日，不推断具体时刻或时区。']:[]),'外部资料未经农场适用性审核；内部农场信息 N/A。','全文、附件、代码及数据的再利用许可需单独核实。']};
}
export function parseHtmlArticle(source:CollectorSource,response:HttpResult):ExternalArticle|null{
 const $=cheerio.load(response.text);
 let title=clean($('meta[name="ArticleTitle"]').attr('content')??$('meta[property="og:title"]').attr('content')??$('h1').first().text()??'')||clean($('title').text());
 if(/验证码|人机验证|访问过于频繁|captcha|access denied/i.test(title))return null;
 const published=$('meta[name="PubDate"],meta[name="pubdate"],meta[name="publishdate"],meta[name="date"],meta[property="article:published_time"]').first().attr('content')??$('[class*="time"],[class*="date"],.info,.article-info,.pubtime').map((_,e)=>$(e).text()).get().find(t=>/20\d{2}[-年/.]\d/.test(t))??null;
 $('script,style,nav,header,footer,form,.footer,.nav,.share,.recommend').remove();
 const selectors=['.TRS_Editor','.trs_editor','.TRS_UEDITOR','.v_news_content','#zoom','#Zoom','#UCAP-CONTENT','.article-content','.article_content','.article-con','.article_con','.content-article','.art_content','.detail_content','.content-detail','.zw-content','.zwnr','article'];
 let body='';for(const selector of selectors){const t=clean($(selector).first().text());if(t.length>=60){body=t;break;}}
 const limitations:string[]=[];
 if(source.id==='nmc-agrometeorology') {
  // Verified against the official page DOM, 2026-10-13; never take menu text.
  title=clean($('#text > .title').text()); body=clean($('#text > .writing').text());
  const issued=$('#text > .author').text();
  if(!title || body.length<200) return null;
  return article(source,response,title,response.url,body,issued,['全国农业气象周报，非本场预警；图片和附表未结构化解析。','网页资料与图件再利用限制见中央气象台声明；原文短摘不替代原文。']);
 }
 if(source.id==='fao-integrated-aquaculture') {
  if(!/^\/4\/y1187e\/y1187e(?:21|27)\.htm$/.test(new URL(response.url).pathname)) return null;
  const chapterTitle=$('h1,h2,h3').map((_,e)=>clean($(e).text())).get().find(t=>t.length>5&&!/^(?:integrated agriculture-aquaculture\b|contents\b|table of contents\b|a primer$)/i.test(t));
  if(!chapterTitle) return null;
  title=chapterTitle;
  if(!body) body=$('p').map((_,e)=>clean($(e).text())).get().filter(t=>t.length>=70).join(' ');
  if(body.length<200) return null;
  limitations.push('2001年出版物章节，月日未知；仅提取段落，图表与历史单位换算未核验。');
 }
 if(!title||body.length<60||!isAgricultural(title,body))return null;
 if($('a[href]').toArray().some(e=>/\.(?:docx?|pdf|xlsx?|zip)(?:$|\?)/i.test($(e).attr('href')??'')))limitations.push('发现附件；附件未下载或解析，正文不代表附件全文。');
 if(source.id==='fao-integrated-aquaculture')limitations.push('历史国际背景资料，不是今日资讯或本地操作依据。');
 if(source.id==='ezhou-hydrology')limitations.push('区域水文通报不代表塘口水位；测站、高程及有效时间需另核。');
 if(source.id==='nmc-agrometeorology')limitations.push('农业气象图像未转录，区域图不能判定具体田塘受灾。');
 return article(source,response,title,response.url,body,published,limitations);
}
export function discoverArticles(source:CollectorSource,html:string,base:string):string[]{
 const $=cheerio.load(html),found:string[]=[];
 $('a[href]').each((_,element)=>{const label=clean($(element).attr('title')||$(element).text());if(label.length<7||!isAgricultural(label))return;
  try{const url=new URL($(element).attr('href')!,base);url.hash='';if(url.protocol!=='https:'||!source.hosts.includes(url.hostname)||url.username||url.password||/\.(?:pdf|docx?|jpg|png|zip)(?:$|\?)/i.test(url.href))return;
   if(/\/(?:index|list|category|channel|home|default|search)(?:[_-][^/]*)?\.(?:s?html?|aspx)$/i.test(url.pathname)||url.pathname.endsWith('/'))return;
   if(source.id==='caas-iarrp'&&!/^\/kjkf\/yyjzcg\/[a-f0-9]{16,40}\.htm$/i.test(url.pathname))return;
   if(source.id==='ezhou-hydrology'&&!/水位|水雨|雨情|汛情|防汛|梁子湖|水文/.test(label))return;
   if(/\.(?:s?html?|aspx)(?:$|\?)|\/info\/|\/detail\/|\/20\d{2}\d{2}\//i.test(url.href)&&url.href!==base)found.push(url.href);
  }catch{/* malformed links are not request targets */}
 });return[...new Set(found)];
}
export interface CollectOptions extends HttpOptions{now?:string;sourceIds?:string[];maxArticles?:number;concurrency?:number;credentials?:{qweatherHost?:string;qweatherKey?:string;qweatherJwt?:string;openAlexKey?:string;githubToken?:string}}
function requireOk(response:HttpResult){if(response.status<200||response.status>=300)throw new SourceError(`HTTP_${response.status}`);}
function abstractText(index:Record<string,number[]>|null):string{if(!index)return'';const result:string[]=[];for(const[word,positions]of Object.entries(index))for(const position of positions)if(position>=0&&position<10000)result[position]=word;return result.filter(Boolean).join(' ');}
async function collectOne(source:CollectorSource,options:CollectOptions):Promise<SourceResult>{
 const result:SourceResult={sourceId:source.id,status:'empty',articles:[],requests:[],errors:[],gaps:[]};
 const maximum=Math.min(2,Math.max(1,options.maxArticles??2));
 const credentials=options.credentials??{qweatherHost:process.env.QWEATHER_API_HOST,qweatherKey:process.env.QWEATHER_API_KEY,qweatherJwt:process.env.QWEATHER_JWT,openAlexKey:process.env.OPENALEX_API_KEY,githubToken:process.env.GITHUB_SOURCE_TOKEN};
 let hosts=source.hosts;
 if(source.adapter==='qweather'){
  if(!credentials.qweatherHost||!credentials.qweatherKey&&!credentials.qweatherJwt){result.status='blocked';result.gaps.push('CREDENTIALS_REQUIRED: QWEATHER_API_HOST 与 QWEATHER_API_KEY 或 QWEATHER_JWT 未配置；日预报与预警均未接通，不能解释为无预警。');return result;}
  const host=credentials.qweatherHost.replace(/^https:\/\//,'').replace(/\/$/,'');if(!/^[a-z0-9-]+\.qweatherapi\.com$/i.test(host)){result.status='blocked';result.errors.push('QWEATHER_HOST_INVALID');return result;}hosts=[host];
 }
 const http=createSourceHttp(hosts,result.requests,{...options,minIntervalMs:source.adapter==='arxiv'?Math.max(3000,options.minIntervalMs??3000):options.minIntervalMs});
 const get=async(url:string,headers?:Record<string,string>)=>{const response=await http(url,headers);requireOk(response);return response;};
 try{
  if(source.adapter==='html'){
   const origin=new URL(source.url).origin,robots=await http(`${origin}/robots.txt`);if(![200,404,410].includes(robots.status))throw new SourceError(`ROBOTS_UNAVAILABLE_HTTP_${robots.status}`);
   const allowed=(url:string)=>robots.status!==200||robotsAllows(robots.text,url);
   for(const entry of source.entryUrls){if(!allowed(entry))throw new SourceError('ROBOTS_DISALLOWED');const index=await get(entry),direct=source.direct?parseHtmlArticle(source,index):null;if(direct)result.articles.push(direct);
    for(const url of (source.direct?[]:discoverArticles(source,index.text,index.url).slice(0,3))){if(result.articles.length>=maximum)break;if(!allowed(url)){result.gaps.push('ROBOTS_DISALLOWED_ARTICLE');continue;}const page=await get(url),parsed=parseHtmlArticle(source,page);if(parsed)result.articles.push(parsed);else result.gaps.push('ARTICLE_FILTERED_OR_BODY_UNAVAILABLE');}
    if(result.articles.length>=maximum)break;
   }
   if(!result.articles.length)result.gaps.push('NO_EXTRACTABLE_AGRICULTURAL_ARTICLES: 页面可访问不等于取得有效文章；可能为动态列表、图像或未匹配正文。');
  }else if(source.adapter==='arxiv'){
   const url=new URL(source.url);url.search=new URLSearchParams({search_query:'all:aquaculture OR all:"crop monitoring" OR all:"agricultural remote sensing"',start:'0',max_results:'6',sortBy:'submittedDate',sortOrder:'descending'}).toString();
   const response=await get(url.href),$=cheerio.load(response.text,{xml:true});
   $('entry').each((_,e)=>{if(result.articles.length>=maximum)return;const node=$(e),title=clean(node.find('title').text()),content=clean(node.find('summary').text()),link=node.find('id').text().replace(/^http:/,'https:');if(isAgricultural(title,content)&&content&&/^https:\/\/arxiv\.org\/abs\//.test(link))result.articles.push(article(source,response,title,link,content,node.find('published').text(),['arXiv 预印本，同行评审状态需另核；仅采集摘要。']));});
  }else if(source.adapter==='openalex'){
   const url=new URL(source.url);url.search=new URLSearchParams({search:'aquaculture',filter:`to_publication_date:${new Date().toISOString().slice(0,10)}`,sort:'publication_date:desc','per-page':'6'}).toString();if(credentials.openAlexKey)url.searchParams.set('api_key',credentials.openAlexKey);
   const response=await get(url.href),data=JSON.parse(response.text);
   for(const work of data.results??[]){if(result.articles.length>=maximum)break;const title=String(work.display_name??''),content=abstractText(work.abstract_inverted_index);if(!content){result.gaps.push('ABSTRACT_UNAVAILABLE');continue;}if(!isAgricultural(title,content))continue;const link=work.doi??work.primary_location?.landing_page_url??work.id;if(typeof link!=='string'||!link.startsWith('https://'))continue;result.articles.push(article(source,response,title,link,content,work.publication_date,['OpenAlex 索引摘要，未获取或验证论文全文；索引收录不代表研究已验证。']));}
  }else if(source.adapter==='github'){
   const url=new URL(source.url);url.search=new URLSearchParams({q:'topic:agriculture archived:false',sort:'updated',order:'desc',per_page:'6'}).toString();
   const response=await get(url.href,credentials.githubToken?{Authorization:`Bearer ${credentials.githubToken}`,Accept:'application/vnd.github+json'}:{Accept:'application/vnd.github+json'}),data=JSON.parse(response.text);
   for(const repo of data.items??[]){if(result.articles.length>=maximum)break;const content=String(repo.description??''),title=String(repo.full_name??'');if(!isAgricultural(title,`${content} ${(repo.topics??[]).join(' ')}`)||!content||!/^https:\/\/github\.com\//.test(repo.html_url))continue;result.articles.push(article(source,response,title,repo.html_url,content,null,['工具仓库描述，未运行或验证代码；星标不代表科学有效性。',`仓库更新时间：${String(repo.updated_at??'未知')}；不作为论文或发布版本的发表时间。`,`仓库许可元数据：${String(repo.license?.spdx_id??'未标明')}；模型、数据许可另核。`]));}
  }else if(source.adapter==='open-meteo'){
   const url=new URL(source.url);url.search=new URLSearchParams({latitude:'30.1417',longitude:'114.625',current:'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',daily:'temperature_2m_max,temperature_2m_min,precipitation_sum',forecast_days:'3',timezone:'Asia/Shanghai'}).toString();
   const response=await get(url.href),data=JSON.parse(response.text),current=data.current;if(!current||typeof current.time!=='string'||!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude))throw new SourceError('WEATHER_SCHEMA');
   if(data.timezone!=='Asia/Shanghai' || data.current_units?.temperature_2m!=='°C' || data.current_units?.relative_humidity_2m!=='%' || data.current_units?.wind_speed_10m!=='km/h' || data.current_units?.precipitation!=='mm') throw new SourceError('WEATHER_UNITS_SCHEMA');
   const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
   const time=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current.time)?`${current.time}:00+08:00`:null;if(!time)throw new SourceError('WEATHER_TIME_SCHEMA');
   result.weather={latitude:data.latitude,longitude:data.longitude,temperatureC:number(current.temperature_2m),humidityPercent:number(current.relative_humidity_2m),windKph:number(current.wind_speed_10m),precipitationMm:number(current.precipitation),time,kind:'model_forecast',provider:'Open-Meteo'};
   result.articles.push(article(source,response,'梁子湖区域模型天气与三日预报',response.url,`Open-Meteo 区域模型数据（不是传感器实测），模型网格 ${data.latitude},${data.longitude}，时间 ${current.time} Asia/Shanghai。当前模型字段：${JSON.stringify(current)}；单位：${JSON.stringify(data.current_units)}。三日预报：${JSON.stringify(data.daily)}；单位：${JSON.stringify(data.daily_units)}。`,null,['坐标为梁子湖区范围推算中心附近模型网格，非农场定位。','Open-Meteo 补充来源，不代表和风预警已接通，也不能据此判断无预警。','归因 Open-Meteo；按官方条款使用，免费接口面向非商业用途：https://open-meteo.com/en/terms']));
  }else if(source.adapter==='qweather'){
   const headers:Record<string,string>=credentials.qweatherJwt?{Authorization:`Bearer ${credentials.qweatherJwt}`}:{'X-QW-Api-Key':credentials.qweatherKey!};
   for(const route of ['weather/v1/daily','weatheralert/v1/current']){
    const response=await get(`https://${hosts[0]}/${route}/30.1417/114.625`,headers),data=JSON.parse(response.text);if(data.error||data.code&&data.code!=='200')throw new SourceError('QWEATHER_API_ERROR');
    result.articles.push(article(source,response,route.includes('alert')?'和风梁子湖区域预警 API 资料':'和风梁子湖区域日预报 API 资料',response.url,JSON.stringify(data),null,['官方 API 响应，预警有效期、取消/更新关系及归因需单独核实。','区域展示中心不是农场位置。']));
   }
  }
  const seen=new Set<string>();result.articles=result.articles.filter(a=>{if(a.publishedDate && a.publishedDate>a.fetchedAt.slice(0,10)){result.gaps.push('FUTURE_PUBLICATION_DATE_EXCLUDED');return false;}const key=a.url+a.contentHash;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,maximum);
  result.status=result.articles.length?result.gaps.length?'partial':'success':'empty';
 }catch(error){const code=error instanceof SourceError?error.code:error instanceof SyntaxError?'RESPONSE_PARSE_ERROR':'COLLECTOR_ERROR';result.errors.push(code);result.status=result.articles.length?'partial':/ROBOTS|HTTP_40[13]|HTTP_429|CREDENTIAL|HOST_INVALID/.test(code)?'blocked':'failed';}
 return result;
}
export async function collectExternalSources(options:CollectOptions={}):Promise<SourceResult[]>{
 if(options.sourceIds?.some(id=>!COLLECTOR_SOURCES.some(s=>s.id===id)))throw new SourceError('UNKNOWN_SOURCE_ID');
 const selected=COLLECTOR_SOURCES.filter(s=>!options.sourceIds||options.sourceIds.includes(s.id));const results:SourceResult[]=new Array(selected.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,Math.max(1,options.concurrency??3),selected.length)},async()=>{while(cursor<selected.length){const index=cursor++;results[index]=await collectOne(selected[index],options);}}));return results;
}
