export type Category = "tech" | "finance" | "politics";
export type SourceType =
  | "rss"
  | "api"
  | "scrape"
  | "web-list"
  | "github-entity"
  | "x-user"
  | "rsshub"
  | "bilibili-user"
  | "youtube-channel"
  | "academic-author"
  | "policy-list";

export type SourceEntityType = "person" | "company" | "media" | "institution";
export type SourceTier = "T0" | "T1" | "T2" | "T3";

export interface SourceDef {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  category: Category;
  /**
   * Group key within a category. Render order/labels are defined per
   * category in lib/output/render.ts. Categories without a registered
   * order render flat (no L2 tabs).
   */
  subcategory?: string;
  /**
   * When true, the rss fetcher shells out to curl instead of using
   * Node's undici. Required for hosts that TLS-fingerprint Node
   * (Cloudflare's "Just a moment…" challenge — LinuxDo, Reddit, etc.)
   */
  useCurl?: boolean;
  enabled?: boolean;
  /**
   * Source content language. Default treated as "en". When this equals
   * the active REPORT_LOCALE, the summary-enrichment step skips this
   * source — its content is already in the target language, so an LLM
   * "summary" would just be a slightly-shorter rewrite.
   */
  lang?: "zh" | "en";
  /**
   * Report locales this source participates in. Defaults to ["zh", "en"]
   * (both) when omitted. Set to ["zh"] for Chinese-only sources whose
   * content is meaningless to English-mode readers (V2EX/LinuxDo/etc.),
   * or ["en"] for English-community sources used to replace Chinese ones
   * when REPORT_LOCALE=en. The registry filters by REPORT_LOCALE at load.
   */
  locales?: ("zh" | "en")[];
  /**
   * Optional human-readable note explaining why a source is disabled or
   * any context useful for fork users. Ignored at runtime.
   */
  notes?: string;
  /**
   * Maximum number of items the fetcher should return. RSS defaults to 30
   * when omitted; custom fetchers can use their own conservative defaults.
   */
  limit?: number;
  /**
   * Optional keyword filter list. When present, only items whose title or
   * body matches at least one keyword (case-insensitive) are kept.
   * Omit or leave empty to return all items unfiltered.
   */
  keywords?: string[];
  /**
   * Field scope for keyword filtering. Defaults to title + excerpt; use
   * "title" for feeds whose excerpts include noisy page/category boilerplate.
   */
  keywordFields?: "title" | "title-excerpt";
  /**
   * Source-specific tag list for API-backed company directories.
   */
  tags?: string[];
  /**
   * Maximum number of paginated API pages to read.
   */
  maxPages?: number;
  /** New sources can be collected without entering the generated digest. */
  shadowMode?: boolean;
  entityType?: SourceEntityType;
  entity?: string;
  tier?: SourceTier;
  topics?: string[];
  dailyLimit?: number;
  authRef?: string;
  /** Generic HTML list extraction options. */
  itemSelector?: string;
  linkSelector?: string;
  titleSelector?: string;
  excerptSelector?: string;
  dateSelector?: string;
  includePaths?: string[];
  excludePaths?: string[];
  /** GitHub entity adapter options. */
  githubHandle?: string;
  githubEntityKind?: "user" | "org";
  githubRepos?: string[];
  /** Repository directory whose latest Markdown files are published content. */
  githubRepo?: string;
  githubContentPath?: string;
  /** X API user timeline handle, without @. */
  xHandle?: string;
  /** RSSHub route for Bilibili or another authenticated platform source. */
  rsshubPath?: string;
  /** YouTube channel ID used to construct the official Atom feed. */
  youtubeChannelId?: string;
  /** Academic-author adapter options. */
  academicAuthor?: string;
  openAlexId?: string;
}

export interface RawArticle {
  sourceId: string;
  title: string;
  url: string;
  excerpt?: string;
  publishedAt?: Date;
  category: Category;
  /**
   * LLM-generated summary in the active REPORT_LOCALE language. For zh
   * reports this is the Chinese translation/summary of an English source;
   * for en reports it'd be the English summary of a non-English source.
   */
  summary?: string;
  /**
   * Structured one-line metadata to display above the excerpt — currently
   * used by GitHub Trending for "Language · ★stars · forks · stars today".
   */
  meta?: string;
  /** Longer source-grounded body, e.g. a video transcript. Not rendered verbatim. */
  contentText?: string;
  /** Structured metrics used for freshness decisions, not display copy. */
  metrics?: {
    starsTotal?: number;
    starsToday?: number;
    views?: number;
    likes?: number;
  };
}
