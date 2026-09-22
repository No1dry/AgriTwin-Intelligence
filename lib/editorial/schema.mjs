// Configuration protocol shared with FeishuBrief-Console. Generated from its typed schema.
import { z } from "zod";
const keyword = z.string().trim().min(2).max(100);
const topicSchema = z
    .object({
    id: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(60),
    name: z.string().trim().min(1).max(50),
    enabled: z.boolean(),
    priority: z.enum(["P0", "P1", "P2"]),
    weight: z.number().min(0).max(2),
    keywords: z.array(keyword).min(1).max(40),
    aliases: z.array(keyword).max(40),
    excludeKeywords: z.array(keyword).max(40),
})
    .strict();
const countsSchema = z
    .object({
    tech: z.number().int().min(3).max(12),
    finance: z.number().int().min(3).max(12),
    politics: z.number().int().min(2).max(8),
})
    .strict();
export const configSchema = z
    .object({
    schemaVersion: z.literal(3),
    name: z.string().trim().min(1).max(60),
    researchTopics: z
        .array(topicSchema)
        .min(1)
        .max(12)
        .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "主题 ID 不能重复"),
    papers: z
        .object({
        minimumScore: z.number().int().min(20).max(100),
        dailyMaximum: z.number().int().min(1).max(40),
        historyDays: z.number().int().min(1).max(90),
        arxivMaximum: z.number().int().min(1).max(20),
        requireAbstract: z.boolean(),
    })
        .strict(),
    sourceOverrides: z.record(z.string().regex(/^[a-z0-9_-]+$/), z
        .object({
        enabled: z.boolean().optional(),
        priority: z.enum(["P0", "P1", "P2"]).optional(),
        dailyLimit: z.number().int().min(1).max(100).optional(),
    })
        .strict()),
    daily: z
        .object({
        editorCandidates: z
            .object({
            tech: z.number().int().min(10).max(60),
            finance: z.number().int().min(5).max(40),
            politics: z.number().int().min(5).max(30),
        })
            .strict(),
        webMaximum: z.number().int().min(20).max(200),
    })
        .strict(),
    notifications: z
        .object({
        feishu: countsSchema,
        pushplus: countsSchema,
        overview: z.boolean(),
        market: z.boolean(),
    })
        .strict(),
    weekly: z
        .object({
        enabled: z.boolean(),
        weekday: z.number().int().min(0).max(6),
        requireCompleteDays: z.literal(7),
        reviewMinimumScore: z.number().int().min(80).max(100),
    })
        .strict(),
    models: z
        .object({
        workerConcurrency: z.number().int().min(1).max(8),
        editorTimeout: z.number().int().min(120).max(600),
        reviewerThreshold: z.number().int().min(70).max(100),
    })
        .strict(),
})
    .strict()
    .refine((c) => c.researchTopics.some((t) => t.enabled && t.weight > 0), "至少启用一个研究主题");
export const defaultConfig = {
    schemaVersion: 3,
    name: "AI Frontier",
    researchTopics: [
        {
            id: "vla",
            name: "VLA",
            enabled: true,
            priority: "P0",
            weight: 1.4,
            keywords: ["VLA", "vision-language-action"],
            aliases: [
                "vision language action",
                "robotic foundation model",
                "visuomotor",
            ],
            excludeKeywords: [],
        },
        {
            id: "agent",
            name: "Agent",
            enabled: true,
            priority: "P0",
            weight: 1.2,
            keywords: ["agent", "agentic", "multi-agent"],
            aliases: ["tool use", "computer use", "autonomous research"],
            excludeKeywords: ["air combat", "eye clinic"],
        },
        {
            id: "world-model",
            name: "World Model",
            enabled: true,
            priority: "P0",
            weight: 1,
            keywords: ["world model", "world models"],
            aliases: ["latent dynamics", "video world model", "predictive world"],
            excludeKeywords: [],
        },
        {
            id: "embodied",
            name: "具身智能",
            enabled: true,
            priority: "P1",
            weight: 0.8,
            keywords: ["具身智能", "embodied"],
            aliases: ["robot learning", "robot policy", "机器人学习"],
            excludeKeywords: [],
        },
    ],
    papers: {
        minimumScore: 52,
        dailyMaximum: 20,
        historyDays: 14,
        arxivMaximum: 6,
        requireAbstract: true,
    },
    sourceOverrides: {},
    daily: {
        editorCandidates: { tech: 25, finance: 20, politics: 15 },
        webMaximum: 200,
    },
    notifications: {
        feishu: { tech: 5, finance: 5, politics: 3 },
        pushplus: { tech: 5, finance: 5, politics: 3 },
        overview: true,
        market: true,
    },
    weekly: {
        enabled: false,
        weekday: 0,
        requireCompleteDays: 7,
        reviewMinimumScore: 85,
    },
    models: { workerConcurrency: 3, editorTimeout: 300, reviewerThreshold: 80 },
};
