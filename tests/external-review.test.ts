import test from 'node:test';
import assert from 'node:assert/strict';
import { KimiError, type KimiResult } from '../lib/ai/kimi.js';
import { generateExternalBrief, selectArticles, validateExternalBrief } from '../lib/external/brief.js';
import { validateCollectionCache } from '../lib/external/cache.js';
import type { ExternalArticle, ExternalBrief, ExternalSource, SourceResult } from '../lib/external/types.js';

const now = '2026-10-12T15:00:00.000Z';
const finishedAt = '2026-10-12T15:01:00.000Z';
const source: ExternalSource = {
  id: 'review-source', name: 'Review source', category: 'research',
  url: 'https://example.org/research', priority: 'P1', accessMethod: 'html', credentialRequired: false,
};
function article(index = 0): ExternalArticle {
  return {
    id: `review-${index}`, sourceId: source.id, sourceName: source.name, category: 'research',
    title: `水稻遥感研究 ${index}`, url: `https://example.org/research/${index}`,
    content: '本研究讨论水稻遥感监测的方法和适用限制。研究结果仍需在不同区域验证。',
    publishedAt: null, publishedDate: '2020-02-29', datePrecision: 'date', fetchedAt: now,
    responseHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), limitations: [], synthetic: false,
  };
}
function result(articles = [article()]): SourceResult {
  return {
    sourceId: source.id, status: 'success', articles,
    requests: [{ url: source.url, status: 200, fetchedAt: now, responseHash: 'a'.repeat(64), bytes: 100 }],
    errors: [], gaps: [],
  };
}
function cache() { return { collectedAt: now, results: [result()] }; }
async function collected(): Promise<ExternalBrief> {
  return generateExternalBrief([result()], [source], { mode: 'collect', now, clock: () => finishedAt });
}
function successfulOutput(content: string): KimiResult {
  const input = JSON.parse(content).articles as { id: string; evidence: string }[];
  return {
    text: JSON.stringify({ items: input.map(a => ({ id: a.id, summary: '研究水稻遥感监测及适用限制。', quote: a.evidence.split('\n')[1].slice(0, 20) })) }),
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: 'stop', durationMs: 1, model: 'kimi-k2.6',
  };
}

test('review: a duplicate URL retains the newest publication even when the older copy was fetched later', () => {
  const older = { ...article(), id: 'older', publishedDate: '2026-10-01', fetchedAt: finishedAt };
  const newer = { ...article(), id: 'newer', publishedDate: '2026-10-10', url: article().url + '#section' };
  assert.deepEqual(selectArticles([result([older, newer])]).map(a => a.id), ['newer']);
});

test('review: duplicate publication timestamps are compared as instants across time zones', () => {
  const older: ExternalArticle = { ...article(), id: 'older-zone', publishedDate: null, datePrecision: 'datetime', publishedAt: '2026-10-10T20:00:00+08:00' };
  const newer: ExternalArticle = { ...article(), id: 'newer-zone', publishedDate: null, datePrecision: 'datetime', publishedAt: '2026-10-10T14:00:00Z' };
  assert.deepEqual(selectArticles([result([older, newer])]).map(a => a.id), ['newer-zone']);
});

test('review: unknown publication dates remain unknown after a later generation completes', async () => {
  const input: ExternalArticle = { ...article(), publishedDate: null, datePrecision: 'unknown' };
  const brief = await generateExternalBrief([result([input])], [source], { mode: 'collect', now, clock: () => finishedAt });
  assert.equal(brief.articles[0].publishedAt, null);
  assert.equal(brief.articles[0].publishedDate, null);
  assert.equal(brief.articles[0].datePrecision, 'unknown');
  assert.equal(brief.meta.dataAsOf, now);
  assert.equal(brief.meta.generatedAt, finishedAt);
  assert.equal(brief.modelRun.finishedAt, null);
});

test('review: non-successful summaries cannot carry a displayable summary, quote or citation', async () => {
  const original = await collected();
  for (const status of ['failed', 'not_run', 'budget_deferred'] as const) {
    for (const field of ['summary', 'evidenceQuote', 'citations'] as const) {
      const mutated = structuredClone(original);
      mutated.articles[0].modelSummary.status = status;
      if (field === 'citations') mutated.articles[0].modelSummary.citations = [article().url];
      else mutated.articles[0].modelSummary[field] = '不应展示的未验证模型内容';
      assert.throws(() => validateExternalBrief(mutated), /PUBLIC_FALSE_SUMMARY/, `${status}.${field}`);
    }
  }
});

test('review: invalid call counts and inconsistent token accounting are rejected', async () => {
  const original = await collected();
  for (const calls of [-1, 0.5, 4, Number.NaN]) {
    const mutated = structuredClone(original); mutated.modelRun.calls = calls;
    assert.throws(() => validateExternalBrief(mutated), /PUBLIC_MODEL_BUDGET/);
  }
  for (const usage of [
    { promptTokens: -1, completionTokens: 1, totalTokens: 0 },
    { promptTokens: 1, completionTokens: 0.5, totalTokens: 1.5 },
    { promptTokens: 1, completionTokens: 1, totalTokens: 3 },
  ]) {
    const mutated = structuredClone(original); mutated.modelRun.usage = usage;
    assert.throws(() => validateExternalBrief(mutated), /PUBLIC_MODEL_USAGE/);
  }
  const falseSuccess = structuredClone(original);
  falseSuccess.modelRun.status = 'succeeded'; falseSuccess.meta.modelExecution = 'succeeded';
  falseSuccess.modelRun.calls = 1;
  assert.throws(() => validateExternalBrief(falseSuccess), /PUBLIC_MODEL_STATUS/);
});

test('review: publication precision rejects impossible calendar dates and timestamps without zones', async () => {
  const original = await collected();
  for (const publishedDate of ['2026-02-29', '2026-02-30', '2026-13-01']) {
    const mutated = structuredClone(original); mutated.articles[0].publishedDate = publishedDate;
    assert.throws(() => validateExternalBrief(mutated), /PUBLIC_DATE_PRECISION/, publishedDate);
  }
  for (const publishedAt of ['2026-10-10', '2026-10-10T12:00:00', '2026-02-30T12:00:00Z']) {
    const mutated = structuredClone(original);
    Object.assign(mutated.articles[0], { publishedAt, publishedDate: null, datePrecision: 'datetime' });
    assert.throws(() => validateExternalBrief(mutated), /PUBLIC_DATE_PRECISION/, publishedAt);
  }
});

test('review: a global failure stops sending later batches and preserves known billed usage', async () => {
  let calls = 0;
  const brief = await generateExternalBrief([result(Array.from({ length: 18 }, (_, i) => article(i)))], [source], {
    mode: 'live', now, clock: () => finishedAt, apiKey: 'test-only',
    call: async messages => {
      calls++;
      if (calls === 1) return successfulOutput(messages[1].content);
      throw new KimiError('KIMI_HTTP_RATE_LIMITED', { promptTokens: 2, completionTokens: 0, totalTokens: 2 }, true, 1);
    },
  });
  assert.equal(calls, 2);
  assert.equal(brief.modelRun.status, 'partial');
  assert.equal(brief.modelRun.usage?.totalTokens, 32);
  assert.equal(brief.modelRun.finishedAt, finishedAt);
  assert.equal(brief.articles.filter(a => a.modelSummary.status === 'succeeded').length, 6);
  assert.equal(brief.articles.filter(a => a.modelSummary.status === 'failed').length, 12);
  assert.equal(brief.articles.filter(a => a.modelSummary.status === 'budget_deferred').length, 0);
  assert.equal(brief.articles.filter(a => a.modelSummary.limitations.some(l => l.includes('尚未发送模型'))).length, 6);
  assert.ok(brief.articles.filter(a => a.modelSummary.status === 'failed').every(a => a.modelSummary.summary === null && a.modelSummary.citations.length === 0));
});

test('review: one billed request with unknown usage invalidates the apparent complete total', async () => {
  let calls = 0;
  const brief = await generateExternalBrief([result(Array.from({ length: 7 }, (_, i) => article(i)))], [source], {
    mode: 'live', now, clock: () => finishedAt, apiKey: 'test-only',
    call: async messages => {
      calls++;
      if (calls === 1) return successfulOutput(messages[1].content);
      throw new KimiError('KIMI_TIMEOUT', null, true, 60_000);
    },
  });
  assert.equal(brief.modelRun.status, 'partial');
  assert.equal(brief.modelRun.usage, null);
  assert.match(brief.modelRun.summary, /用量未知/);
});

test('review: cache rejects malformed, future and stale envelope timestamps', () => {
  for (const collectedAt of ['invalid-date', '2026-10-12T15:01:00.000Z', '2026-10-11T14:59:59.000Z']) {
    const value = cache(); value.collectedAt = collectedAt;
    assert.throws(() => validateCollectionCache(value, now, [source.id]), undefined, collectedAt);
  }
});

test('review: a fresh cache envelope cannot relabel stale or future source responses', () => {
  for (const fetchedAt of ['invalid-date', '2026-10-11T14:59:59.000Z', '2026-10-12T15:01:00.000Z']) {
    const staleRequest = cache(); staleRequest.results[0].requests[0].fetchedAt = fetchedAt;
    assert.throws(() => validateCollectionCache(staleRequest, now, [source.id]), undefined, `request ${fetchedAt}`);
    const staleArticle = cache(); staleArticle.results[0].articles[0].fetchedAt = fetchedAt;
    assert.throws(() => validateCollectionCache(staleArticle, now, [source.id]), undefined, `article ${fetchedAt}`);
  }
});

test('review: cached results and articles cannot introduce an unregistered source', () => {
  const unknownResult = cache(); unknownResult.results[0].sourceId = 'unregistered-source';
  assert.throws(() => validateCollectionCache(unknownResult, now, [source.id]));
  const unknownArticle = cache(); unknownArticle.results[0].articles[0].sourceId = 'unregistered-source';
  assert.throws(() => validateCollectionCache(unknownArticle, now, [source.id]));
});

test('review: freshly fetched historical publications and blocked sources without requests remain valid', () => {
  assert.equal(validateCollectionCache(cache(), now, [source.id])[0].articles[0].publishedDate, '2020-02-29');
  const blocked = cache();
  blocked.results[0] = { sourceId: source.id, status: 'blocked', articles: [], requests: [], errors: ['CREDENTIALS_REQUIRED'], gaps: [] };
  assert.equal(validateCollectionCache(blocked, now, [source.id])[0].status, 'blocked');
});
