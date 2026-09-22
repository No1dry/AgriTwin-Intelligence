# FeishuBrief · 技术情报日报工作流

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)
[![LLM: 可插拔](https://img.shields.io/badge/LLM-pluggable-orange.svg)](#llm-后端)

每天由 GitHub Actions 聚合科技、论文、人物、机构、财经与时政信源，经过新鲜度过滤、质量筛选和 LLM 编辑，生成中文日报网页，并按配置推送到飞书与 PushPlus。

- [完整日报与历史归档](https://no1dry.github.io/daily-brief-site/)
- [FeishuBrief Console 工作台](https://no1dry.github.io/FeishuBrief-Console/)

## 当前能力

- GitHub Actions 定时生成，目标时间为北京时间 08:00；带补跑检查和同日幂等保护。
- 135 个登记信源，中文模式当前启用 106 个，覆盖 RSS、API、网页、GitHub、X、B站、YouTube、OpenAlex 与政策页面。
- 技术动态按内容路由到前沿研究、工程与开源、产品与产业、人物观点等模块。
- 论文重点跟踪 VLA、Agent、World Model 与具身智能；质量评分、跨平台 arXiv ID 去重和历史排重后最多展示 20 篇。
- 普通信源执行 14 天 URL/标题排重；个人、企业与机构的旧内容还会经过发布时间过滤。
- GitHub Trending 以当日涨星数排序；重复项目只有出现明显二次加速才再次进入。
- B站投稿只收近期更新，基于可用字幕或完整投稿简介生成摘要；缺少实际内容时不展示。
- 日报结构、论文参数、研究重点、信源启停和通知条数可在工作台编辑，提交后由下一次 Actions 运行读取。
- 正常与恢复路径都经过摘要完整性门禁；科技、财经、时政不足 3/3/2 条时拒绝消息推送。

## 仓库与部署

系统使用三个仓库，职责彼此隔离：

```text
No1dry/FeishuBrief（私有后端）
  └─ GitHub Actions：抓取、筛选、LLM、渲染、推送
       ├─ HTML/JSON ──► No1dry/daily-brief-site（公开日报）
       └─ 配置/状态 ◄─► No1dry/FeishuBrief-Console（公开静态前端）
```

| 仓库                         | 可见性 | 职责                                                |
| ---------------------------- | ------ | --------------------------------------------------- |
| `No1dry/FeishuBrief`         | 私有   | 源码、配置、Actions、模型与通知密钥                 |
| `No1dry/daily-brief-site`    | 公开   | 只保存渲染后的日报和历史归档                        |
| `No1dry/FeishuBrief-Console` | 公开   | 静态工作台；通过用户提供的细粒度 Token 连接私有后端 |

工作台 Token 只保存在当前页面内存，不进入前端仓库、URL、localStorage 或 sessionStorage。建议仅授权 `FeishuBrief` 仓库的 Contents 与 Actions 权限。

## 工作台

[FeishuBrief Console](https://no1dry.github.io/FeishuBrief-Console/) 可完成：

- 调整研究主题、关键词、别名、排除词、权重与优先级。
- 启停信源、调整每日上限，查看最近抓取内容。
- 调整论文阈值、数量、arXiv 上限和历史排重窗口。
- 独立设置网页展示数量和飞书/PushPlus 摘要数量。
- 对历史日报进行配置影响回放，查看语义 Diff、本地版本与远程提交。
- 查看 Actions 状态；手动生成时固定 `send_notifications=false`。
- 单独选择日期和渠道后推送已有日报；推送目标始终使用仓库预设值。

当前周报生成仍属于后续阶段。多模型日报路由已经接入：配置 `DEEPSEEK_API_KEY` 后，DeepSeek Worker 与 Reviewer 自动启用；没有该 Secret 时保持原 Kimi 流程。

## LLM 后端

全部调用通过统一 `runLlm()` 分发。设置 `LLM_BACKEND` 与对应密钥即可切换：

| backend      | API Key               | 常用配置                        |
| ------------ | --------------------- | ------------------------------- |
| `anthropic`  | `ANTHROPIC_API_KEY`   | Anthropic 或 Anthropic 兼容服务 |
| `openai`     | `OPENAI_API_KEY`      | OpenAI 或 OpenAI 兼容服务       |
| `deepseek`   | `DEEPSEEK_API_KEY`    | DeepSeek API                    |
| `minimax`    | `MINIMAX_API_KEY`     | MiniMax API                     |
| `zhipu`      | `ZHIPU_API_KEY`       | 智谱兼容服务                    |
| `claude-cli` | 本机 Claude Code 登录 | 本地运行                        |

也可使用通用的 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL` 接入 Moonshot、SiliconFlow、OpenRouter 或自建兼容服务。完整变量见 [`.env.example`](.env.example)。

### 多模型角色

| 角色     | 默认模型                                           | 职责                                 |
| -------- | -------------------------------------------------- | ------------------------------------ |
| Worker   | DeepSeek Flash                                     | 批量摘要、技术内容理解、论文语义初审 |
| Editor   | 当前 `LLM_BACKEND` / `LLM_MODEL`，本仓为 Kimi K2.6 | 中文选题、总览和最终成稿             |
| Reviewer | DeepSeek V4 Pro                                    | 独立审稿、证据核对、遗漏与重复检查   |

Reviewer 未通过时，Kimi 根据问题清单修订一次，再由 Reviewer 复审。配置 Reviewer 后，最终复审仍失败的报告可以发布网页，但飞书和 PushPlus 会拒绝发送。模型不能修改信源、Secret、推送目标或绕过程序质量门。

## 信息处理规则

### 历史新鲜度

Actions 在生成前恢复已发布的历史 sidecar。当前候选会在 LLM 调用前过滤：

- 同一规范化 URL，或同一信源下的同标题，14 天内只出现一次。
- 跟踪参数、URL fragment 与 GitHub blob commit SHA 不会制造“新内容”。
- 有发布日期的个人、公司和机构更新通常限 72 小时；视频限 48 小时。
- 没有可靠日期的条目可以首次进入，但之后受 URL/标题历史约束。
- 完整规则与阈值见 [`docs/source-freshness.md`](docs/source-freshness.md)。

### GitHub

GitHub Trending 是 T0 级信源，按 `stars today` 降序。14 天内再次出现时，当日涨星速度必须超过历史最高值至少 20%，且绝对增加不少于 25 Stars/day。

个人与组织 GitHub 不再每天返回“最近 push 的仓库”。适配器只关注近期公开的新仓库、PublicEvent 和 Release；已出现项目需要新增 20–100 Stars 才允许再次进入。

### B站

RSSHub 用于发现投稿；随后读取 B站视频元数据、发布时间、创作者简介和可用字幕。摘要使用字幕或足够完整的投稿简介，只有标题时直接排除。字幕只在摘要阶段使用，不写入公开 sidecar。

### 论文

arXiv、Hugging Face、OpenReview 与重点作者论文合并后，按研究方向、实验/基准、代码/数据、热度和时效评分。跨平台按 arXiv ID 去重，历史窗口默认 14 天；质量不足时允许少于上限，不用弱相关论文补数。

## 完整信源列表

正式源位于 [`sources.config.json`](sources.config.json)，人物、机构、媒体和政策扩展源位于 [`sources.candidates.json`](sources.candidates.json)。`enabled: false` 表示保留配置但不抓取；`shadowMode: true` 表示只写入影子 sidecar。

<!-- SOURCE_LIST:START -->

当前登记 **135** 个信源，其中 **108** 个全局启用；中文模式启用 **106** 个。此表由 `npm run readme:sources` 从两份信源配置自动生成。

### 科技 / AI

| 分类 | 信源 | ID | 接入方式 | 状态 | 优先级 |
|---|---|---|---|---|---|
| AI 应用 | [36氪 AI](https://news.google.com/rss/search?q=site%3A36kr.com%20%28AI%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20OR%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%20OR%20%E6%9C%BA%E5%99%A8%E4%BA%BA%29&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans) | `36kr-ai` | RSS | 启用 | — |
| AI 应用 | [机器之心](https://www.jiqizhixin.com/) | `jiqizhixin-ai` | 网页抓取 | 启用 | — |
| AI 应用 | [a16z AI](https://a16z.com/news-content/) | `a16z-ai` | 网页抓取 | 启用 | — |
| AI 应用 | [CB Insights AI](https://www.cbinsights.com/research/artificial-intelligence/) | `cbinsights-ai` | 网页抓取 | 启用 | — |
| AI 应用 | [Crunchbase AI](https://api.crunchbase.com/api/v4/searches/organizations) | `crunchbase-ai` | API | 启用 | — |
| AI 应用 | [HN AI New](https://hnrss.org/newest?q=AI&points=50) | `hn-ai-new` | RSS | 启用 | — |
| AI 应用 | [HN Launch HN](https://hnrss.org/newest?q=Launch+HN) | `hn-launch-hn-ai` | RSS | 启用 | — |
| AI 应用 | [HN Show AI](https://hnrss.org/show?q=AI+robot+automation) | `hn-show-ai` | RSS | 启用 | — |
| AI 应用 | [Product Hunt](https://www.producthunt.com/feed) | `producthunt-ai` | RSS | 启用 | — |
| AI 应用 | [Sequoia AI](https://sequoiacap.com/stories/) | `sequoia-ai` | 网页抓取 | 启用 | — |
| AI 应用 | [TechCrunch AI](https://techcrunch.com/category/artificial-intelligence/feed/) | `techcrunch-ai` | RSS | 启用 | — |
| AI 应用 | [TechCrunch Funding](https://techcrunch.com/tag/funding/feed/) | `techcrunch-funding-ai` | RSS | 启用 | — |
| AI 应用 | [TechCrunch Startups](https://techcrunch.com/category/startups/feed/) | `techcrunch-startups-ai` | RSS | 启用 | — |
| AI 应用 | [The Spoon](https://thespoon.tech/category/ai/feed/) | `thespoon-ai` | RSS | 启用 | — |
| AI 应用 | [Y Combinator AI](https://api.ycombinator.com/v0.1/companies?batch=S2026&tags=AI) | `ycombinator-ai` | API | 启用 | — |
| AI 新闻 | [量子位](https://www.qbitai.com/feed) | `qbitai` | RSS | 启用 | — |
| AI 新闻 | [DeepMind Blog](https://deepmind.google/blog/rss.xml) | `deepmind-blog` | RSS | 启用 | — |
| AI 新闻 | [Hugging Face Blog](https://huggingface.co/blog/feed.xml) | `huggingface-blog` | RSS | 启用 | — |
| AI 新闻 | [Latent Space](https://www.latent.space/feed) | `latent-space` | RSS | 启用 | — |
| AI 新闻 | [MIT Tech Review AI](https://www.technologyreview.com/topic/artificial-intelligence/feed) | `mit-tech-review-ai` | RSS | 启用 | — |
| AI 新闻 | [OpenAI News](https://openai.com/news/rss.xml) | `openai-news` | RSS | 启用 | — |
| AI 新闻 | [Smol AI News](https://github.com/smol-ai/ainews-web-2025/tree/main/src/content/issues) | `smol-ai-news` | GitHub API | 停用 | — |
| AI 新闻 | [TLDR AI](https://tldr.tech/api/rss/ai) | `tldr-ai` | RSS | 启用 | — |
| 博客周刊 | [阮一峰的网络日志](https://www.ruanyifeng.com/blog/atom.xml) | `ruanyf-blog` | RSS | 停用 | — |
| 博客周刊 | [Cloudflare Blog](https://blog.cloudflare.com/rss/) | `cloudflare-blog` | RSS | 停用 | — |
| 博客周刊 | [GitHub Engineering](https://github.blog/engineering/feed/) | `github-engineering` | RSS | 停用 | — |
| 博客周刊 | [HelloGitHub 月刊](https://hellogithub.com/rss/all) | `hellogithub` | RSS | 停用 | — |
| 博客周刊 | [Martin Fowler](https://martinfowler.com/feed.atom) | `martinfowler` | RSS | 停用 | — |
| 博客周刊 | [Simon Willison](https://simonwillison.net/atom/everything/) | `simonwillison` | RSS | 停用 | — |
| 中文社区 | [掘金](https://juejin.cn/rss) | `juejin` | RSS | 停用 | — |
| 中文社区 | [LinuxDo](https://linux.do/top.rss?period=daily) | `linuxdo` | RSS | 启用 | — |
| 中文社区 | [V2EX](https://www.v2ex.com/api/topics/show.json) | `v2ex-hot` | API | 启用 | — |
| 国内技术媒体 | [极客邦科技](https://www.geekbang.org/) | `geekbang-tech` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [甲子光年](https://www.jazzyear.com/) | `jazzyear` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [开源中国](https://www.oschina.net/news) | `oschina-news` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [雷峰网](https://www.leiphone.com/) | `leiphone-tech` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [数据派 THU](https://mp.weixin.qq.com/) | `datapie-thu` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [晚点 LatePost](https://news.google.com/rss/search?q=site%3Alatepost.com%20%28AI%20OR%20%E7%A7%91%E6%8A%80%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20OR%20%E5%A4%A7%E6%A8%A1%E5%9E%8B%29&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans) | `latepost-tech` | RSS | 启用 | T2 |
| 国内技术媒体 | [芯东西](https://www.zhidx.com/) | `zhidx-chip` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [新智元](https://news.google.com/rss/search?q=%E6%96%B0%E6%99%BA%E5%85%83%20AI%20%E5%A4%A7%E6%A8%A1%E5%9E%8B&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans) | `aixinzhiyuan` | RSS | 启用 | T2 |
| 国内技术媒体 | [智东西](https://www.zhidx.com/) | `zhidx-ai` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [AI 科技评论](https://www.leiphone.com/category/ai) | `leiphone-ai-review` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [CSDN AI 精选](https://www.csdn.net/) | `csdn-ai` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [InfoQ 中文](https://www.infoq.cn/) | `infoq-cn` | 网页列表 | 启用 | T2 |
| 国内技术媒体 | [SegmentFault 思否](https://segmentfault.com/) | `segmentfault-tech` | 网页列表 | 启用 | T2 |
| 工程与开源 | [CNCF Blog](https://www.cncf.io/feed/) | `cncf-blog` | RSS | 启用 | T0 |
| 工程与开源 | [Google Project Zero](https://googleprojectzero.blogspot.com/feeds/posts/default) | `project-zero-blog` | RSS | 启用 | T0 |
| 工程与开源 | [OpenSSF Blog](https://openssf.org/feed/) | `openssf-blog` | RSS | 启用 | T0 |
| GitHub Trending | [GitHub Trending](https://github.com/trending) | `github-trending` | 网页抓取 | 启用 | T0 |
| 海外来源 | [BBC Technology](https://feeds.bbci.co.uk/news/technology/rss.xml) | `bbc-tech` | RSS | 停用 | — |
| 海外来源 | [TechCrunch](https://techcrunch.com/feed/) | `techcrunch` | RSS | 停用 | — |
| 海外来源 | [The Verge](https://www.theverge.com/rss/index.xml) | `theverge` | RSS | 停用 | — |
| 海外分析媒体 | [IEEE Spectrum AI](https://spectrum.ieee.org/artificial-intelligence) | `ieee-spectrum-ai` | 网页列表 | 启用 | T2 |
| 海外分析媒体 | [Import AI](https://news.google.com/rss/search?q=site%3Aimportai.substack.com%20AI&hl=en-US&gl=US&ceid=US%3Aen) | `import-ai` | RSS | 启用 | T2 |
| 海外分析媒体 | [Quanta Computer Science](https://www.quantamagazine.org/feed/) | `quanta-computer-science` | RSS | 启用 | T2 |
| 海外分析媒体 | [Stratechery](https://stratechery.com/feed/) | `stratechery` | RSS | 启用 | T2 |
| 海外分析媒体 | [The Batch](https://news.google.com/rss/search?q=DeepLearning.AI%20%22The%20Batch%22&hl=en-US&gl=US&ceid=US%3Aen) | `the-batch` | RSS | 启用 | T2 |
| 海外社区 | [Hacker News](https://hacker-news.firebaseio.com/v0) | `hackernews` | API | 启用 | — |
| 海外社区 | [Lobsters](https://lobste.rs/rss) | `lobsters` | RSS | 停用 | — |
| 海外社区 | [r/stocks](https://www.reddit.com/r/stocks/.rss) | `reddit-stocks` | RSS | 启用 | — |
| 海外新闻 | [Ars Technica](https://feeds.arstechnica.com/arstechnica/index) | `ars-technica` | RSS | 停用 | — |
| 海外新闻 | [Solidot 奇客](https://www.solidot.org/index.rss) | `solidot` | RSS | 停用 | — |
| 政策与标准 | [工信部科技政策](https://www.miit.gov.cn/) | `miit-tech-policy` | 政策网页 | 启用 | T0 |
| 政策与标准 | [国家网信办 AI 政策](https://www.cac.gov.cn/) | `cac-ai-policy` | 政策网页 | 启用 | T0 |
| 政策与标准 | [中国计算机学会](https://www.ccf.org.cn/) | `ccf-news` | 政策网页 | 启用 | T0 |
| 政策与标准 | [中国信通院](https://news.google.com/rss/search?q=site%3Acaict.ac.cn%20(%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20OR%20%E7%AE%97%E5%8A%9B%20OR%20%E6%95%B0%E6%8D%AE%20OR%20%E6%A0%87%E5%87%86)&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans) | `caict-reports` | RSS | 启用 | T0 |
| 研究机构与公司 | [Anthropic News](https://www.anthropic.com/news) | `anthropic-news` | 网页列表 | 启用 | T0 |
| 研究机构与公司 | [Anthropic Research](https://www.anthropic.com/research) | `anthropic-research` | 网页列表 | 启用 | T0 |
| 研究机构与公司 | [Google Research Blog](https://research.google/blog/) | `google-research-blog` | 网页列表 | 启用 | T0 |
| 研究机构与公司 | [Meta AI Blog](https://news.google.com/rss/search?q=site%3Aai.meta.com%2Fblog%20Meta%20AI&hl=en-US&gl=US&ceid=US%3Aen) | `meta-ai-blog` | RSS | 启用 | T0 |
| 研究机构与公司 | [Microsoft Research Blog](https://www.microsoft.com/en-us/research/feed/) | `microsoft-research-blog` | RSS | 启用 | T0 |
| 研究机构与公司 | [NVIDIA Generative AI Blog](https://developer.nvidia.com/blog/category/generative-ai/feed/) | `nvidia-developer-ai` | RSS | 启用 | T0 |
| 研究机构与公司 | [NVIDIA Research](https://research.nvidia.com/rss.xml) | `nvidia-research` | RSS | 启用 | T0 |
| 研究机构与公司 | [NVIDIA Robotics Blog](https://developer.nvidia.com/blog/category/robotics/feed/) | `nvidia-developer-robotics` | RSS | 启用 | T0 |
| 论文与作者 | [arXiv cs.AI](https://rss.arxiv.org/rss/cs.AI) | `arxiv-cs-ai` | RSS | 启用 | T0 |
| 论文与作者 | [arXiv cs.LG](https://rss.arxiv.org/rss/cs.LG) | `arxiv-cs-lg` | RSS | 启用 | T0 |
| 论文与作者 | [OpenReview](https://openreview.net/) | `openreview` | 网页列表 | 启用 | T0 |
| 技术人物 | [戴琼海论文](https://www.tsinghua.edu.cn/) | `person-dai-qionghai` | OpenAlex | 启用 | T1 |
| 技术人物 | [何恺明论文](https://people.csail.mit.edu/kaiming/) | `person-he-kaiming` | OpenAlex | 启用 | T1 |
| 技术人物 | [李开复 零一万物](https://www.lingyiwanwu.com/) | `person-kai-fu-lee` | 网页列表 | 启用 | T1 |
| 技术人物 | [李沐 GitHub](https://github.com/d2l-ai) | `person-li-mu-github` | GitHub API | 启用 | T1 |
| 技术人物 | [彭志辉 智元技术发布](https://www.agibot.com/) | `person-peng-zhihui` | 网页列表 | 启用 | T1 |
| 技术人物 | [唐杰 智谱技术发布](https://www.zhipuai.cn/) | `person-tang-jie` | 网页列表 | 启用 | T1 |
| 技术人物 | [王小川 百川智能](https://www.baichuan-ai.com/) | `person-wang-xiaochuan` | 网页列表 | 启用 | T1 |
| 技术人物 | [王兴兴 宇树新闻](https://www.unitree.com/cn/news/) | `person-wang-xingxing` | 网页列表 | 启用 | T1 |
| 技术人物 | [杨植麟 月之暗面](https://www.moonshot.cn/) | `person-yang-zhilin` | 网页列表 | 启用 | T1 |
| 技术人物 | [张钹论文](https://www.tsinghua.edu.cn/) | `person-zhang-bo` | OpenAlex | 启用 | T1 |
| 技术人物 | [张亚勤 AIR](https://air.tsinghua.edu.cn/) | `person-zhang-yaqin` | 网页列表 | 启用 | T1 |
| 技术人物 | [周伯文 衔远科技](https://news.google.com/rss/search?q=site%3Afrontis.ai%20%E5%91%A8%E4%BC%AF%E6%96%87%20AI&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans) | `person-zhou-bowen` | RSS | 启用 | T1 |
| 技术人物 | [朱松纯论文](https://www.bigai.ai/) | `person-zhu-songchun` | OpenAlex | 启用 | T1 |
| 技术人物 | [Ahead of AI](https://magazine.sebastianraschka.com/feed) | `person-sebastian-raschka` | RSS | 启用 | T1 |
| 技术人物 | [Andrej Karpathy GitHub](https://github.com/karpathy) | `person-karpathy-github` | GitHub API | 启用 | T1 |
| 技术人物 | [Andrej Karpathy YouTube](https://www.youtube.com/@AndrejKarpathy) | `person-karpathy-youtube` | YouTube Atom | 启用 | T1 |
| 技术人物 | [Chip Huyen Blog](https://huyenchip.com/blog/) | `person-chip-huyen` | 网页列表 | 启用 | T1 |
| 技术人物 | [Daphne Koller Papers](https://profiles.stanford.edu/daphne-koller) | `person-daphne-koller` | OpenAlex | 启用 | T1 |
| 技术人物 | [Dario Amodei Anthropic Posts](https://www.anthropic.com/news) | `person-dario-amodei` | 网页列表 | 启用 | T1 |
| 技术人物 | [Harrison Chase GitHub](https://github.com/hwchase17) | `person-harrison-chase-github` | GitHub API | 启用 | T1 |
| 技术人物 | [Lilian Weng Blog](https://lilianweng.github.io/) | `person-lilian-weng` | 网页列表 | 启用 | T1 |
| 技术人物 | [Pieter Abbeel Papers](https://people.eecs.berkeley.edu/~pabbeel/) | `person-pieter-abbeel` | OpenAlex | 启用 | T1 |
| 技术人物 | [Schneier on Security](https://www.schneier.com/feed/atom/) | `person-bruce-schneier` | RSS | 启用 | T1 |
| 技术人物 | [Thomas Wolf GitHub](https://github.com/thomwolf) | `person-thomas-wolf-github` | GitHub API | 启用 | T1 |
| 技术人物 | [李沐 B站投稿](https://space.bilibili.com/1567748478) | `person-li-mu-bilibili` | B站 / RSSHub | 启用 | T2 |
| 技术人物 | [稚晖君 B站投稿](https://space.bilibili.com/20259914) | `person-peng-zhihui-bilibili` | B站 / RSSHub | 启用 | T2 |
| 技术人物 | [Demis Hassabis X](https://x.com/demishassabis) | `person-demis-hassabis-x` | X API | 启用 | T3 |
| 技术人物 | [Fei Fei Li X](https://x.com/drfeifei) | `person-feifei-li-x` | X API | 启用 | T3 |
| 技术人物 | [Jeff Dean X](https://x.com/JeffDean) | `person-jeff-dean-x` | X API | 启用 | T3 |
| 技术人物 | [Jim Fan X](https://x.com/DrJimFan) | `person-jim-fan-x` | X API | 启用 | T3 |
| 技术人物 | [Yann LeCun X](https://x.com/ylecun) | `person-yann-lecun-x` | X API | 启用 | T3 |
| 热门论文 | [HuggingFace Trending Papers](https://huggingface.co/api/daily_papers) | `huggingface-papers` | API | 启用 | — |
| X 热点 | [X 推文 (AttentionVC)](https://reply-vc-90459984647.us-central1.run.app/v1/articles/leaderboard?window=3d&category=ai&lang=en&limit=30) | `attentionvc-ai` | API | 启用 | — |

### 财经

| 分类 | 信源 | ID | 接入方式 | 状态 | 优先级 |
|---|---|---|---|---|---|
| 社区 | [r/ChinaStocks](https://www.reddit.com/r/ChinaStocks/.rss) | `reddit-chinastocks` | RSS | 停用 | — |
| 社区 | [r/investing](https://www.reddit.com/r/investing/.rss) | `reddit-investing` | RSS | 停用 | — |
| 社区 | [r/wallstreetbets](https://www.reddit.com/r/wallstreetbets/.rss) | `reddit-wallstreetbets` | RSS | 停用 | — |
| 财经新闻 | [华尔街见闻](https://rsshub.app/wallstreetcn/news/global) | `wallstreetcn` | RSS | 停用 | — |
| 财经新闻 | [人民网财经](http://www.people.com.cn/rss/finance.xml) | `people-finance` | RSS | 停用 | — |
| 财经新闻 | [BBC Business](https://feeds.bbci.co.uk/news/business/rss.xml) | `bbc-business` | RSS | 启用 | — |
| 财经新闻 | [Bloomberg Markets](https://feeds.bloomberg.com/markets/news.rss) | `bloomberg-markets` | RSS | 启用 | — |
| 财经新闻 | [CNBC](https://www.cnbc.com/id/100003114/device/rss/rss.html) | `cnbc-topnews` | RSS | 停用 | — |
| 财经新闻 | [Financial Times](https://www.ft.com/companies?format=rss) | `ft-companies` | RSS | 启用 | — |
| 财经新闻 | [FT中文网](https://www.ftchinese.com/rss/news) | `ftchinese-news` | RSS | 停用 | — |
| 财经新闻 | [MarketWatch](https://feeds.content.dowjones.io/public/rss/mw_topstories) | `marketwatch-top` | RSS | 停用 | — |
| 财经新闻 | [The Economist Finance](https://www.economist.com/finance-and-economics/rss.xml) | `economist-finance` | RSS | 启用 | — |
| 财经新闻 | [WSJ Markets](https://feeds.a.dj.com/rss/RSSMarketsMain.xml) | `wsj-markets` | RSS | 启用 | — |
| 财经新闻 | [Yahoo Finance](https://finance.yahoo.com/news/rssindex) | `yahoo-finance` | RSS | 停用 | — |

### 国际时政

| 分类 | 信源 | ID | 接入方式 | 状态 | 优先级 |
|---|---|---|---|---|---|
| 未分类 | [人民网国际](http://www.people.com.cn/rss/world.xml) | `people-world` | RSS | 停用 | — |
| 未分类 | [人民网时政](http://www.people.com.cn/rss/politics.xml) | `peoples-daily` | RSS | 停用 | — |
| 未分类 | [新华网时政](http://www.xinhuanet.com/politics/news_politics.xml) | `xinhua-politics` | RSS | 停用 | — |
| 未分类 | [RFA 中文](https://www.rfa.org/mandarin/RSS) | `rfa-chinese` | RSS | 停用 | — |
| 国际新闻 | [Al Jazeera](https://www.aljazeera.com/xml/rss/all.xml) | `aljazeera` | RSS | 启用 | — |
| 国际新闻 | [BBC World](https://feeds.bbci.co.uk/news/world/rss.xml) | `bbc-world` | RSS | 启用 | — |
| 国际新闻 | [DW 中文](https://rss.dw.com/rdf/rss-chi-all) | `dw-chinese` | RSS | 启用 | — |
| 国际新闻 | [NPR World](https://feeds.npr.org/1004/rss.xml) | `npr-world` | RSS | 启用 | — |
| 国际新闻 | [NYT World](https://rss.nytimes.com/services/xml/rss/nyt/World.xml) | `nyt-world` | RSS | 启用 | — |
| 国际新闻 | [The Diplomat](https://thediplomat.com/feed/) | `the-diplomat` | RSS | 启用 | — |
| 国际新闻 | [The Guardian](https://www.theguardian.com/world/rss) | `guardian-world` | RSS | 启用 | — |

<!-- SOURCE_LIST:END -->

## 推送渠道

### 飞书

使用企业自建应用发送交互卡片，需要：

| 名称                | 类型     | 说明                                   |
| ------------------- | -------- | -------------------------------------- |
| `FEISHU_APP_SECRET` | Secret   | 自建应用 App Secret                    |
| `FEISHU_APP_ID`     | Variable | 自建应用 App ID                        |
| `FEISHU_CHAT_ID`    | Variable | 预设目标群聊 chat_id；多个值用逗号分隔 |
| `FEISHU_REPORT_URL` | Variable | 日报网页基址                           |
| `FEISHU_BASE_URL`   | Variable | 可选；Lark 国际版地址                  |

应用需开通 `im:message` 权限、发布版本并加入目标群。工作台不读取或显示 App Secret 与群 ID，也不允许临时输入任意群 ID。

### PushPlus

| 名称                  | 类型     | 说明                     |
| --------------------- | -------- | ------------------------ |
| `PUSHPLUS_TOKEN`      | Secret   | PushPlus 发送 Token      |
| `PUSHPLUS_TOPIC`      | Variable | 可选；群组编码           |
| `PUSHPLUS_REPORT_URL` | Variable | 可选；完整网页版链接基址 |

## GitHub Actions 配置

常用 Variables：

| 变量                       | 默认            | 说明                       |
| -------------------------- | --------------- | -------------------------- |
| `REPORT_TZ`                | `Asia/Shanghai` | 报告日期与时间门时区       |
| `REPORT_HOUR`              | `8`             | 目标小时，可用逗号设置多个 |
| `REPORT_DAYS`              | `*`             | cron 风格星期过滤          |
| `REPORT_LOCALE`            | `zh`            | `zh` 或 `en`               |
| `PAGES_REPOSITORY`         | —               | 日报发布目标仓库           |
| `SOURCE_FETCH_CONCURRENCY` | `6`             | 信源抓取并发，最大 12      |

扩展平台 Secrets：

- `GIT_SOURCE_TOKEN`：提高 GitHub API 配额。
- `X_BEARER_TOKEN`：读取 X 用户时间线。
- `BILIBILI_COOKIE_0`：RSSHub 的 B站登录态。

## 本地命令

| 命令                      | 用途                                             |
| ------------------------- | ------------------------------------------------ |
| `npm run daily`           | 完整抓取、分析、生成和渲染，不会自动调用通知脚本 |
| `npm run dry-run`         | 只抓取信源，不调用 LLM                           |
| `npm run render [date]`   | 使用已有 sidecar 重新渲染                        |
| `npm run notify`          | 推送已有日报到飞书预设群                         |
| `npm run notify-pushplus` | 推送已有日报到 PushPlus                          |
| `npm run build-site`      | 生成日报首页和归档页                             |
| `npm run sources`         | 查看全部信源状态                                 |
| `npm run sources:check`   | 校验信源配置                                     |
| `npm run freshness:check` | 校验历史排重、GitHub 涨星和 B站内容规则          |
| `npm run papers:check`    | 校验论文筛选和历史排重                           |
| `npm run digest:check`    | 校验消息摘要完整性门禁                           |
| `npm run editorial:check` | 校验工作台配置协议和运行时接入                   |
| `npm run roles:check`     | 校验 Kimi/DeepSeek 模型角色路由                  |
| `npm run reviewer:check`  | 校验独立审稿门禁与阻断规则                       |
| `npm run readme:sources`  | 从信源配置重新生成 README 清单                   |
| `npm run readme:check`    | 检查 README 信源清单是否与配置一致               |

手动生成但不推送：

```bash
gh workflow run daily.yml -f send_notifications=false
```

工作台也提供同样的“生成日报”操作，并固定关闭通知。

## 输出与排障

每天输出：

```text
daily_reports/<date>/
  <date>.html
  <date>.json
  <date>-articles.json
  <date>-shadow-articles.json
```

排障顺序：

1. 查看 GitHub Actions 对应运行和阶段日志。
2. 查看 sidecar 中的 `freshness` 统计与 `editorialPolicyHash`。
3. 本地查看 `logs/llm-calls.jsonl` 或运行 `npm run quota-report`。
4. 仅显示异常时，使用 `npm run render [date]`，无需重新调用模型。

更多改源与部署说明见 [FORKING.md](FORKING.md)，工作台后端接入见 [`docs/console-integration.md`](docs/console-integration.md)。

## 项目来源

本项目 fork 自 [leiting-eric/DailyBrief](https://github.com/leiting-eric/DailyBrief)，感谢原作者提供新闻聚合、LLM 简报与行情面板框架。

当前 fork 增加了飞书与 PushPlus 推送、三仓发布、研究方向与论文策展、跨日新鲜度过滤、GitHub 涨星策略、B站内容摘要以及前端工作台。

## License

MIT，详见 [LICENSE](LICENSE)。
