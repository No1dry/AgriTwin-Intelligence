# AgriTwin Intelligence

农业外部情报采集 → 官方 Kimi K2.6 摘要 → 有出处的 JSON / Markdown 简报。当前仅处理公开外部资料；内部农场、ontology、地块和传感器尚未接入，公开输出为 N/A。

来源清单位于 `lib/external/sources.ts`：原调研 16 组，加 Open-Meteo 区域模型天气，共 17 组。登记不代表已接通，实际成功、部分成功、空结果、受阻与失败以每次运行结果为准。

## 运行

Node.js 24，先执行 `npm ci --ignore-scripts`。

```sh
node --import tsx --test tests/external-*.test.ts
node --import tsx scripts/external-brief.ts
node --import tsx scripts/external-brief.ts --live
node --import tsx scripts/external-brief.ts --live --from-cache
```

不加 `--live` 只采集，不调用模型。缓存仅接受最近 24 小时且内部文章与请求时间也通过校验的数据。

本地密钥模板：`config/external.env.example`。复制到仓库根目录 `.env.kimi.local` 后填写，使用 `node --env-file=.env.kimi.local --import tsx scripts/external-brief.ts --live`。不要提交含真实值的文件。

## Actions 与凭据

[手动运行外部情报工作流](https://github.com/No1dry/AgriTwin-Intelligence/actions/workflows/external-live.yml)，`run_model` 控制是否调用模型，目前未设定时任务。

在 **Settings → Secrets and variables → Actions → New repository secret** 配置：

- `MOONSHOT_API_KEY`：官方 Kimi 必需。
- `QWEATHER_API_HOST` 加 `QWEATHER_API_KEY` 或 `QWEATHER_JWT`：和风专属 Host 与鉴权。未配置时日预报、预警保持未接通，不解释为没有预警。
- `OPENALEX_API_KEY`：可选。

GitHub 工具检索使用工作流内置 token，无需额外创建个人令牌。模型每轮最多 3 次请求、每次 1024 输出 tokens，关闭 thinking，不重试。输入 tokens 另计，用量缺失时显示未知，不等于固定金额预算。

## 输出与展示

- `public/external/latest.json`：经校验的短摘、模型摘要、引用、来源状态、用量。
- `public/external/brief.md`：可阅读简报。
- `artifacts/external/collection.json`：本地完整采集缓存，不作为公开发布文件。

模型失败不会生成假摘要；工作流可发布本轮有效的失败诊断，并保留运行失败信号。每条成功摘要的证据片段必须逐字出现在送给模型的材料中，引用由程序绑定；这不等于专业审核或本场适用性确认。

独立展示：[AgriTwin-Showcase](https://github.com/No1dry/AgriTwin-Showcase)。浏览器读取本仓库公开 JSON，失败时回退站内快照并标明时间。真实梁子湖区域底图采用 Esri World Imagery，非实时；Open-Meteo 是区域模型天气，非农场传感器实测。

## 文档与来源

[对话文档归档](docs/conversation-archive/README.md)按分类、日期和版本保存方案、研究、XMind 与验收记录。

本仓库起源于 FeishuBrief，来源与许可见 [UPSTREAM.md](UPSTREAM.md)、[LICENSE](LICENSE)。历史通用日报入口不作为本阶段农业运行入口；本阶段代码集中于 `lib/external/`、`lib/ai/kimi.ts` 和 `scripts/external-brief.ts`。
