export type ExternalCategory = 'policy' | 'research' | 'weather' | 'guidance' | 'tool';
export interface ExternalArticle {
  id: string; sourceId: string; sourceName: string; category: ExternalCategory;
  title: string; url: string; content: string; summary?: string;
  publishedAt: string | null; publishedDate: string | null;
  datePrecision: 'datetime' | 'date' | 'unknown'; fetchedAt: string;
  responseHash: string; contentHash: string; limitations: string[]; synthetic: false;
}
export interface ExternalWeather {
  latitude: number; longitude: number; temperatureC: number | null;
  humidityPercent: number | null; windKph: number | null; precipitationMm: number | null;
  time: string; kind: 'model_forecast'; provider: string;
}
export interface SourceResult {
  sourceId: string; status: 'success' | 'partial' | 'empty' | 'blocked' | 'failed';
  articles: ExternalArticle[];
  requests: { url: string; status: number | null; fetchedAt: string; responseHash: string; bytes: number }[];
  errors: string[]; gaps: string[]; weather?: ExternalWeather;
}
export interface ExternalSource {
  id: string; name: string; category: ExternalCategory; url: string;
  priority: string; accessMethod: string; credentialRequired: boolean;
}
export interface ArticleSummary {
  status: 'succeeded' | 'failed' | 'not_run' | 'budget_deferred';
  summary: string | null; evidenceQuote: string | null; citations: string[]; limitations: string[];
}
export interface ExternalPublicArticle {
  id: string; sourceId: string; title: string; category: ExternalCategory; publisher: string;
  publishedAt: string | null; publishedDate: string | null; datePrecision: ExternalArticle['datePrecision']; url: string; excerpt: string;
  tags: string[]; limitations: string[]; extractionStatus: 'collected'; synthetic: false;
  responseHash: string; contentHash: string; fetchedAt: string; modelSummary: ArticleSummary;
}
export type ModelExecution = 'not_run' | 'succeeded' | 'partial' | 'failed';
export interface ExternalBrief {
  schemaVersion: 1; kind: 'agritwin-external-intelligence';
  meta: { generatedAt: string; dataAsOf: string; farmConnected: false; modelExecution: ModelExecution };
  region: { name: string; center: [number, number]; verified: boolean; context: string };
  sources: (ExternalSource & {status: SourceResult['status']; reason: string; articleCount: number; fetchedAt: string | null})[];
  articles: ExternalPublicArticle[];
  collection: {status: 'success' | 'partial' | 'failed'; articleCount: number; sourceStatuses: {sourceId: string; status: SourceResult['status']}[]};
  modelRun: {status: ModelExecution; model: 'kimi-k2.6'; ranAt: string | null; finishedAt: string | null; workflowUrl: string;
    usage: {promptTokens: number; completionTokens: number; totalTokens: number} | null;
    calls: number; summary: string};
  weather: ExternalWeather | null; internal: null;
}
