import assert from "node:assert/strict";
import {
  hasDedicatedRole,
  isRoleEnabled,
  resolveLlmTarget,
  validateBackendCredentials,
} from "../lib/ai/llm";

const names = [
  "LLM_BACKEND",
  "LLM_MODEL",
  "LLM_EDITOR_BACKEND",
  "LLM_EDITOR_MODEL",
  "LLM_WORKER_BACKEND",
  "LLM_WORKER_MODEL",
  "LLM_REVIEWER_BACKEND",
  "LLM_REVIEWER_MODEL",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;
const original = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
try {
  for (const name of names) delete process.env[name];
  process.env.LLM_BACKEND = "anthropic";
  process.env.LLM_MODEL = "kimi-k2.6";
  process.env.ANTHROPIC_API_KEY = "test-kimi-key";
  assert.deepEqual(resolveLlmTarget("editor"), {
    role: "editor",
    backend: "anthropic",
    model: "kimi-k2.6",
    baseURL: undefined,
  });
  assert.equal(resolveLlmTarget("worker").backend, "anthropic");
  assert.equal(hasDedicatedRole("worker"), false);
  assert.equal(isRoleEnabled("reviewer"), false);
  validateBackendCredentials();

  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  assert.deepEqual(resolveLlmTarget("worker"), {
    role: "worker",
    backend: "deepseek",
    model: "deepseek-flash",
    baseURL: undefined,
  });
  assert.deepEqual(resolveLlmTarget("reviewer"), {
    role: "reviewer",
    backend: "deepseek",
    model: "deepseek-v4-pro",
    baseURL: undefined,
  });
  assert.equal(hasDedicatedRole("worker"), true);
  assert.equal(isRoleEnabled("reviewer"), true);

  process.env.LLM_WORKER_MODEL = "deepseek-custom-worker";
  process.env.LLM_REVIEWER_MODEL = "deepseek-custom-reviewer";
  assert.equal(resolveLlmTarget("worker").model, "deepseek-custom-worker");
  assert.equal(resolveLlmTarget("reviewer").model, "deepseek-custom-reviewer");
} finally {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
console.log(
  "✓ model roles: Kimi editor fallback, automatic DeepSeek Flash worker, and DeepSeek Pro reviewer routing OK",
);
