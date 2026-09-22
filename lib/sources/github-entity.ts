import { fetchJson } from "./fetch-utils";
import type { RawArticle, SourceDef } from "./types";

type GithubRepo = {
  full_name: string;
  html_url: string;
  description?: string;
  pushed_at?: string;
  language?: string;
  stargazers_count?: number;
  created_at?: string;
  fork?: boolean;
  archived?: boolean;
};

type GithubEvent = {
  type: string;
  created_at: string;
  repo?: { name?: string };
  payload?: { ref_type?: string; release?: GithubRelease };
};

type GithubRelease = {
  name?: string;
  tag_name?: string;
  html_url: string;
  body?: string;
  published_at?: string;
};

type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { date?: string };
  };
};

type GithubCommitDetail = GithubCommit & {
  files?: Array<{ filename: string; raw_url?: string }>;
};

function headers(): Record<string, string> {
  const token =
    process.env.GIT_SOURCE_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  return token
    ? {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      }
    : { Accept: "application/vnd.github+json" };
}

function frontmatterValue(markdown: string, key: string): string | undefined {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  if (!frontmatter) return;
  const value = new RegExp(`^${key}:\\s*(.+)$`, "m")
    .exec(frontmatter)?.[1]
    ?.trim();
  return value?.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
}

async function fetchGithubContent(source: SourceDef): Promise<RawArticle[]> {
  const repo = source.githubRepo!;
  const contentPath = source.githubContentPath!;
  const limit = source.dailyLimit ?? source.limit ?? 5;
  const commits = await fetchJson<GithubCommit[]>(
    `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(contentPath)}&per_page=${limit}`,
    { headers: headers(), timeoutMs: 15000 },
  );
  const seen = new Set<string>();
  const articles = await Promise.all(
    commits.map(async (commit): Promise<RawArticle | null> => {
      try {
        const detail = await fetchJson<GithubCommitDetail>(
          `https://api.github.com/repos/${repo}/commits/${commit.sha}`,
          { headers: headers(), timeoutMs: 12000 },
        );
        const file = detail.files?.find(
          (candidate) =>
            candidate.filename.startsWith(contentPath) &&
            candidate.filename.endsWith(".md") &&
            !seen.has(candidate.filename),
        );
        if (!file?.raw_url) return null;
        seen.add(file.filename);
        const response = await fetch(file.raw_url, {
          headers: { Accept: "text/plain" },
        });
        if (!response.ok) return null;
        const markdown = await response.text();
        const title =
          frontmatterValue(markdown, "title") ||
          commit.commit.message.split("\n", 1)[0];
        const description = frontmatterValue(markdown, "description") ?? "";
        const date =
          frontmatterValue(markdown, "date") || commit.commit.author?.date;
        return {
          sourceId: source.id,
          title,
          url: `https://github.com/${repo}/blob/${commit.sha}/${file.filename}`,
          excerpt: description.replace(/\s+/g, " ").slice(0, 300),
          publishedAt:
            date && !Number.isNaN(new Date(date).getTime())
              ? new Date(date)
              : undefined,
          category: source.category,
        };
      } catch {
        return null;
      }
    }),
  );
  return articles.filter((article): article is RawArticle => article !== null);
}

export async function fetchGithubEntity(
  source: SourceDef,
): Promise<RawArticle[]> {
  const limit = source.dailyLimit ?? source.limit ?? 5;
  if (source.githubRepo && source.githubContentPath) {
    return fetchGithubContent(source);
  }
  if (source.githubRepos?.length) {
    const releases: Array<RawArticle | null> = await Promise.all(
      source.githubRepos.slice(0, limit).map(async (repo) => {
        try {
          const release = await fetchJson<GithubRelease>(
            `https://api.github.com/repos/${repo}/releases/latest`,
            { headers: headers(), timeoutMs: 12000 },
          );
          return {
            sourceId: source.id,
            title: `${repo}: ${release.name || release.tag_name || "New release"}`,
            url: release.html_url,
            excerpt: (release.body ?? "").replace(/\s+/g, " ").slice(0, 300),
            publishedAt: release.published_at
              ? new Date(release.published_at)
              : undefined,
            category: source.category,
          } satisfies RawArticle;
        } catch {
          return null;
        }
      }),
    );
    return releases.filter((item): item is RawArticle => item !== null);
  }

  if (!source.githubHandle) return [];
  const kind = source.githubEntityKind === "org" ? "orgs" : "users";
  const cutoff = Date.now() - 30 * 86_400_000;
  const [events, repos] = await Promise.all([
    fetchJson<GithubEvent[]>(
      `https://api.github.com/${kind}/${source.githubHandle}/events?per_page=50`,
      { headers: headers(), timeoutMs: 15000 },
    ).catch(() => []),
    fetchJson<GithubRepo[]>(
      `https://api.github.com/${kind}/${source.githubHandle}/repos?sort=created&direction=desc&per_page=30`,
      { headers: headers(), timeoutMs: 15000 },
    ),
  ]);
  const eventDates = new Map<string, Date>();
  const releaseArticles: RawArticle[] = [];
  for (const event of events) {
    const created = new Date(event.created_at);
    if (!Number.isFinite(created.getTime()) || created.getTime() < cutoff)
      continue;
    const repo = event.repo?.name;
    if (
      repo &&
      ((event.type === "CreateEvent" &&
        event.payload?.ref_type === "repository") ||
        event.type === "PublicEvent")
    )
      eventDates.set(repo.toLowerCase(), created);
    if (repo && event.type === "ReleaseEvent" && event.payload?.release) {
      const release = event.payload.release;
      releaseArticles.push({
        sourceId: source.id,
        title: `${repo}: ${release.name || release.tag_name || "New release"}`,
        url: release.html_url,
        excerpt: (release.body ?? "").replace(/\s+/g, " ").slice(0, 1200),
        publishedAt: release.published_at
          ? new Date(release.published_at)
          : created,
        category: source.category,
      });
    }
  }
  const repositoryArticles = repos
    .filter(
      (repo) =>
        !repo.fork &&
        !repo.archived &&
        repo.created_at &&
        new Date(repo.created_at).getTime() >= cutoff,
    )
    .map(
      (repo) =>
        ({
          sourceId: source.id,
          title: `${repo.full_name}${repo.language ? ` (${repo.language})` : ""}`,
          url: repo.html_url,
          excerpt:
            `${repo.description ?? ""}${repo.stargazers_count != null ? ` Stars: ${repo.stargazers_count}` : ""}`.trim(),
          publishedAt:
            eventDates.get(repo.full_name.toLowerCase()) ??
            (repo.created_at ? new Date(repo.created_at) : undefined),
          metrics: { starsTotal: repo.stargazers_count },
          category: source.category,
        }) satisfies RawArticle,
    );
  return [...releaseArticles, ...repositoryArticles]
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
}
