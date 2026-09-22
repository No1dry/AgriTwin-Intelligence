export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

export async function fetchText(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; text: string; url: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15000,
  );
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text(), url: res.url };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson<T>(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { status, text } = await fetchText(url, options);
  if (status < 200 || status >= 300) {
    throw new Error(`${url} -> HTTP ${status}`);
  }
  return JSON.parse(text) as T;
}
