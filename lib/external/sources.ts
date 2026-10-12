import type { ExternalCategory, ExternalSource } from './types.js';
export type Adapter = 'html' | 'arxiv' | 'openalex' | 'github' | 'qweather' | 'open-meteo';
export interface CollectorSource extends ExternalSource { adapter: Adapter; entryUrls: string[]; direct?: boolean; hosts: string[]; }
const source = (id: string, name: string, category: ExternalCategory, url: string, priority: string, adapter: Adapter = 'html', direct = false, extra: string[] = []): CollectorSource => ({
 id, name, category, url, priority, adapter, direct, entryUrls: [url, ...extra],
 hosts: [...new Set([url, ...extra].map(u => new URL(u).hostname))],
 accessMethod: adapter === 'html' ? '公开 HTML 列表发现与详情抽取；附件仅识别' : `${adapter} 官方公开接口`, credentialRequired: adapter === 'qweather',
});
export const COLLECTOR_SOURCES: readonly CollectorSource[] = [
 source('hubei-fisheries-extension','湖北省农业事业发展中心（水产技术资料）','guidance','https://hbnysy.hubei.gov.cn/bmdt/ywdt/','P0'),
 source('ezhou-agriculture','鄂州市农业农村局','policy','https://nyj.ezhou.gov.cn/xwzx/tzgg/','P0'),
 source('hubei-agriculture','湖北省农业农村厅','policy','https://nyt.hubei.gov.cn/bmdt/','P1'),
 source('qweather-weather-alerts','和风天气（日预报与预警）','weather','https://dev.qweather.com/docs/api/warning/weather-alert/','P0','qweather'),
 source('nmc-agrometeorology','中央气象台农业气象','weather','https://www.nmc.cn/publish/agro/ten-week/index.html','P1','html',true),
 source('natesc-crop-guidance','全国农业技术推广服务中心','guidance','https://www.natesc.org.cn/Home/','P1'),
 source('moa-fisheries-guidance','农业农村部渔业渔政管理局','guidance','https://yyj.moa.gov.cn/tzgg/','P1'),
 source('hzau-fisheries-research','华中农业大学水产学院','research','https://cf.hzau.edu.cn/kyfw.htm','P2'),
 source('fao-integrated-aquaculture','FAO 稻渔与复合种养资料','guidance','https://www.fao.org/4/y1187e/y1187e21.htm','P2','html',true,['https://www.fao.org/4/y1187e/y1187e27.htm']),
 source('arxiv-agriculture','arXiv 农业定向论文','research','https://export.arxiv.org/api/query','P1','arxiv'),
 source('openalex-agriculture','OpenAlex 农业定向研究','research','https://api.openalex.org/works','P1','openalex'),
 source('github-agriculture-tools','GitHub 农业工具与模型','tool','https://api.github.com/search/repositories','P2','github'),
 source('hubei-meteorological','湖北省气象局','weather','https://hb.cma.gov.cn/','P2'),
 source('ezhou-hydrology','鄂州市水雨工情与梁子湖水位通报','weather','https://www.ezhou.gov.cn/syts/zntj/','P1'),
 source('caas-iarrp','中国农科院农业资源与农业区划研究所','research','https://iarrp.caas.cn/kjkf/yyjzcg/index.htm','P2'),
 source('liangzihu-government','梁子湖区政府涉农政策与农技方案','policy','https://www.liangzh.gov.cn/lzhxxgk/jczwgkbzh/snbtly/','P1'),
 source('open-meteo-regional-weather','Open-Meteo 区域模型天气（补充来源）','weather','https://api.open-meteo.com/v1/forecast','P0','open-meteo'),
];
export const EXTERNAL_SOURCES: ExternalSource[] = COLLECTOR_SOURCES.map(s => ({id:s.id,name:s.name,category:s.category,url:s.url,priority:s.priority,accessMethod:s.accessMethod,credentialRequired:s.credentialRequired}));
