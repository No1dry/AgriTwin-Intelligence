export interface EditorialTopic {
  id: string; name: string; enabled: boolean; priority: "P0" | "P1" | "P2"; weight: number;
  keywords: string[]; aliases: string[]; excludeKeywords: string[];
}
export interface BriefCounts { tech: number; finance: number; politics: number }
export interface EditorialConfig {
  schemaVersion: 3; name: string; researchTopics: EditorialTopic[];
  papers: { minimumScore: number; dailyMaximum: number; historyDays: number; arxivMaximum: number; requireAbstract: boolean };
  sourceOverrides: Record<string, { enabled?: boolean; priority?: "P0" | "P1" | "P2"; dailyLimit?: number }>;
  daily: { editorCandidates: BriefCounts; webMaximum: number };
  notifications: { feishu: BriefCounts; pushplus: BriefCounts; overview: boolean; market: boolean };
  weekly: { enabled: boolean; weekday: number; requireCompleteDays: 7; reviewMinimumScore: number };
  models: { workerConcurrency: number; editorTimeout: number; reviewerThreshold: number };
}
