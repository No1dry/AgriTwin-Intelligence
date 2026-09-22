import type { EditorialConfig, EditorialTopic, BriefCounts } from "./types";
import type { RawArticle, SourceDef } from "../sources/types";
export function loadEditorialConfig(file?: string): EditorialConfig | null;
export function getEditorialConfig(): EditorialConfig | null;
export function editorialPolicyHash(): string;
export function matchesKeyword(text: string, keyword: string): boolean;
export function matchingTopics(
  article: Pick<RawArticle, "title" | "excerpt" | "summary" | "contentText">,
  config?: EditorialConfig | null,
): EditorialTopic[];
export function applySourceOverrides(
  sources: SourceDef[],
  config?: EditorialConfig | null,
): SourceDef[];
export function requestedBriefCounts(
  config?: EditorialConfig | null,
): BriefCounts;
export function getNotificationPolicy(): EditorialConfig["notifications"];
