import assert from "node:assert/strict";
import {
  assessPaper,
  paperCanonicalKey,
  selectCuratedPapers,
} from "../lib/papers/curation";
import type { ArticleInput } from "../lib/ai/pipeline";
import type { SourceDef } from "../lib/sources/types";

const registry: SourceDef[] = [
  {
    id: "arxiv-cs-ai",
    name: "arXiv",
    type: "rss",
    url: "https://arxiv.org",
    category: "tech",
  },
  {
    id: "huggingface-papers",
    name: "HF Papers",
    type: "api",
    url: "https://huggingface.co",
    category: "tech",
  },
];

function paper(overrides: Partial<ArticleInput>): ArticleInput {
  return {
    sourceId: "arxiv-cs-ai",
    source: "arXiv",
    title: "Untitled paper",
    url: "https://arxiv.org/abs/2609.00001",
    excerpt: "",
    publishedAt: new Date(),
    category: "tech",
    ...overrides,
  };
}

const lowSignalAgent = paper({
  title: "An Agent for a Narrow Application",
  url: "https://arxiv.org/abs/2609.00002",
});
assert.equal(selectCuratedPapers([lowSignalAgent], registry).length, 0);

const qualityVla = paper({
  title: "A Vision-Language-Action Model for Generalist Robot Policies",
  url: "https://arxiv.org/abs/2609.00003",
  excerpt:
    "We propose a vision-language-action model evaluated on a real-world robot benchmark. The open-source policy improves task success rate by 18% with extensive ablation experiments.",
});
assert.deepEqual(selectCuratedPapers([qualityVla], registry), [qualityVla]);

const hfDuplicate = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: qualityVla.title,
  url: "https://huggingface.co/papers/2609.00003",
  excerpt: qualityVla.excerpt,
  meta: "👍 120",
});
assert.deepEqual(selectCuratedPapers([qualityVla, hfDuplicate], registry), [
  hfDuplicate,
]);

const excluded = new Set([paperCanonicalKey(qualityVla)]);
assert.equal(
  selectCuratedPapers([qualityVla, hfDuplicate], registry, {
    excludedKeys: excluded,
  }).length,
  0,
);

const semanticRecovery = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: "A Predictive Architecture for Interactive Environments",
  url: "https://huggingface.co/papers/2609.00009",
  excerpt:
    "We introduce a latent predictive architecture with extensive experiments, benchmarks, released code and datasets.",
  meta: "👍 40",
});
const semanticAssessments = new Map([
  [
    semanticRecovery.url,
    {
      relevance: 92,
      quality: 84,
      novelty: 80,
      topics: ["World Model"],
      reason: "核心贡献是交互环境的可迁移预测模型",
    },
  ],
]);
assert.deepEqual(
  selectCuratedPapers([semanticRecovery], registry, { semanticAssessments }),
  [semanticRecovery],
);

const worldModelLateInAbstract = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: "Can an Omni-Modal Model Reason About the Physical World?",
  url: "https://huggingface.co/papers/2609.00004",
  excerpt:
    "We evaluate a unified multimodal architecture. ".repeat(12) +
    "The world model benchmark measures predictive reasoning with experiments and open-source code.",
  meta: "👍 108",
});
assert.deepEqual(selectCuratedPapers([worldModelLateInAbstract], registry), [
  worldModelLateInAbstract,
]);

const worldModelingVariant = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: "Learning Predictive Models across Different Worlds",
  url: "https://huggingface.co/papers/2609.00005",
  excerpt:
    "World modeling enables agents to anticipate consequences. We introduce a benchmark with extensive evaluation, experiments, code and datasets.",
  meta: "👍 52",
});
assert.deepEqual(selectCuratedPapers([worldModelingVariant], registry), [
  worldModelingVariant,
]);

const enterpriseAgentSafety = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: "Can Enterprise AI Assistants Be Trusted Under Pressure?",
  url: "https://huggingface.co/papers/2609.00006",
  excerpt:
    "We introduce an agent compliance benchmark for deployments in hiring, healthcare and finance. The evaluation uses experiments and a released dataset.",
  meta: "👍 26",
});
assert.deepEqual(selectCuratedPapers([enterpriseAgentSafety], registry), [
  enterpriseAgentSafety,
]);

const tradingAgent = paper({
  sourceId: "huggingface-papers",
  source: "HF Papers",
  title: "Self-Evolving LLM Trading Agents for Finance",
  url: "https://huggingface.co/papers/2609.00007",
  excerpt:
    "We introduce an agent policy evaluated with experiments, benchmarks, code and datasets.",
  meta: "👍 32",
});
const neutralAgent = {
  ...tradingAgent,
  title: "Self-Evolving LLM Agents",
  url: "https://huggingface.co/papers/2609.00008",
};
assert.equal(
  assessPaper(neutralAgent, registry[1]).score -
    assessPaper(tradingAgent, registry[1]).score,
  24,
);

console.log(
  "✓ paper curation: full abstracts, topic variants, title-scoped domain penalty, quality threshold, cross-platform dedupe, and history exclusion OK",
);
