> 文档归档副本｜原文日期：2026-10-04｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# 梁子湖农业情报外部来源调研

调研日期：2026-10-04。范围：阅读官方网页、开发文档及农场平台和风适配器源码，没有创建账号、调用付费接口、真实采集任务、修改项目代码或接入生产系统。

建议首批控制在 **12 个来源，经营证据 7 个、研发线索 5 个**。以下均为建议登记项，不表示 AgriTwin 已实现或启用适配器。频率是建议轮询频率，不代表发布机构承诺的更新周期。

验证状态：**D** = 官方 API/协议文档已验证，凭据、实际返回及端到端采集尚未测试；**W** = 官方页面/正文已验证，HTML/PDF 解析和自动访问条件待测；**C** = 仅保留候选，访问或正文提取尚有不确定性。D/W 均不等于生产可用。

## 首批来源表

| ID 与来源 | 用途和适用条件 | 接入、凭据、许可现状 | 建议频率与可靠性/状态 |
|---|---|---|---|
| `hubei-fisheries-extension` 湖北省水产技术推广总站 / 省农业事业发展中心：[极端天气管理措施原文](https://hbnysy.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202607/t20260710_5974033.shtml) | 经营证据。池塘、稻渔模式的防汛、设施巡检、灾后核实。已见资料明确提到鄂州。必须保留养殖模式、对象物种和天气条件，不能把通用建议变成所有塘口的剂量规则。 | 已验证公开 HTML 正文；未发现并验证官方 RSS/API。先选定公开栏目、按原文链接和版本入库，无需为读公开正文创建账号；自动采集及再分发条件另核对。 | 每日 1 次；汛期经验证后每 6 小时。官方本地专业资料，业务相关性高；**W**。 |
| `ezhou-agriculture` 鄂州市农业农村局：[工作动态](https://nyj.ezhou.gov.cn/xwzx/gzdt/) | 经营证据。当地梅雨种植防灾、水产生产指导、农事窗口与政策通知；按鄂州/梁子湖和实际生产批次匹配。一般新闻只进资讯，技术指导才进入知识候选。 | 公开 HTML 列表已验证，含种植和水产防灾条目。未验证官方 RSS/API；须区分本地原创与省级文件转载。 | 每日 1 次，特殊农时可 6 小时。地方性强，但列表可能混杂新闻/转载；**W**。 |
| `hubei-agriculture` 湖北省农业农村厅：[部门动态](https://nyt.hubei.gov.cn/bmdt/)；[水稻高温干旱技术指导样例](https://nyt.hubei.gov.cn/bmdt/yw/ywtz/snyjstgzz_9001/202607/t20260716_5978263.shtml) | 经营证据。水稻、油菜及实际种植品种的农时、防灾、主推技术。水稻指导按早稻/中稻/再生稻和生育期区分；本场作物不明时只展示适用条件，不生成操作任务。 | 官方列表与正文已验证，部分猜测的深层栏目 URL 未能读取，因此必须从实际导航固化入口。未验证官方 RSS/API；HTML/PDF 候选。 | 每日 1 次；官方省级指导，本场适用性仍需规则匹配；**W**。 |
| `qweather-weather-alerts` 和风天气：[预警 API](https://dev.qweather.com/docs/api/warning/weather-alert/)、[天气文档](https://dev.qweather.com/docs/api/weather/) | 经营上下文。梁子湖具体经纬度的日预报与有效预警，用于解释暴雨、大风、高温对塘口/地块的可能影响。气温不等于水温，预警不等于塘口实测异常。 | 正式 API 文档已验证。平台源码已实现 `/weather/v1/daily/{latitude}/{longitude}`、Ed25519 JWT 与 `metadata.attributions`；应复用其日预报管线。当前 `/weatheralert/v1/current/{latitude}/{longitude}` 预警适配器尚未在已检查的和风目录中发现，需后续新增。独立阶段分别使用日预报和预警 fixture。 | 独立测试手动；日预报后续沿用平台调度并按更新频率/配额调整，新增预警建议 5–15 分钟，最终受套餐/服务约定限制。**D；日预报有代码，真实运行待核；预警待实现和验证**。 |
| `nmc-agrometeorology` 中央气象台：[农业气象入口](https://www.nmc.cn/publish/agro/disastersmonitoring/Agricultural_Drought_Monitoring.htm) | 经营背景证据。农业气象周报、土壤水分、农事和灾害风险，筛选湖北/江汉平原/鄂东南。全国或区域图不能推断某块地已经受灾；水产场景仅作天气背景。 | 已验证公开栏目与图文产品，不把网页图片接口当公开业务 API。未验证 RSS/稳定结构化 API；第一版优先可抽取正文，只有图片且无可追溯地理解释的记录进入人工复核。 | 每日 1–2 次，周报按发布日期变化入库。官方气象产品可靠，但空间分辨率限制明显；**W**。 |
| `natesc-crop-guidance` 全国农业技术推广服务中心：[全国农技推广网](https://www.natesc.org.cn/Home/) | 经营知识候选。水稻等已确认种植作物的病虫趋势、墒情、科学施肥和技术指导。不是水生动物疫病源；不把全国病虫趋势判为本田确诊。 | 官方搜索结果验证到通知和技术资料；本轮直接打开首页曾报错，尚未形成可靠栏目提取。未验证公开 RSS/API，不接业务系统内部接口。 | 每日 1 次；国家级专业内容可靠，当前访问稳定性待证；**C**。若首轮独立测试求稳定，可先人工导入 5–10 份已核验资料。 |
| `moa-fisheries-guidance` 农业农村部渔业渔政管理局：[2025 版防灾技术指引](https://yyj.moa.gov.cn/tzgg/202507/t20250725_6476015.htm) | 经营知识候选。汛期、干旱、水产防灾和灾后恢复的基础证据；按淡水池塘/稻渔/其他养殖模式分开。该文件是 2025 版，需保留版本并查是否被替代。 | 已验证官方 HTML 附件页；附件独立下载解析需后续测试。未验证官方 RSS/API；建议手工建立基础文档版本，再监测通知栏目新增修订。 | 每周 1 次 + 年度版本复核。权威基础资料，不提供塘口实时状态；**W**。 |
| `hzau-fisheries-research` 华中农业大学水产学院：[科研服务](https://cf.hzau.edu.cn/kyfw.htm) | 研发线索。淡水鱼健康、养殖尾水、种质、智能养殖；追踪论文 DOI/数据/代码/试验条件。新闻中的实验成果不能直接列为本场可执行技术。 | 公开 HTML 栏目已验证，未验证 RSS/API。保留校方报道与论文原始链接；论文全文另按其许可获取。 | 每周 2–3 次。研究机构原始发布可信，实践适用性必须另验；**W**。 |
| `fao-integrated-aquaculture` FAO：[稻渔养殖综述](https://www.fao.org/4/a0823e/a0823e00.htm)、[农渔复合系统资料](https://www.fao.org/4/y1187e/y1187e00.htm) | 研发/背景知识。复合种养模式、设计约束、收益与风险要素；保留国家、年份和生产系统差异。首批用于建立知识目录，不作为每日新闻或湖北处方。 | 已验证公开 HTML/PDF 资料，未验证所选内容的实时 API/RSS。不同文件许可不同，按文件记录；不据 FAO 名称推定任何全文都可再分发。 | 首次人工精选，之后每月复核。权威资料但部分较旧、地域有差别；**W，静态知识源**。 |
| `arxiv-agriculture` arXiv：[API 手册](https://info.arxiv.org/help/api/user-manual.html)、[API 条款](https://info.arxiv.org/help/api/tou.html) | 研发发现。检索 aquaculture、dissolved oxygen forecasting、rice-fish、crop remote sensing、agricultural digital twin 等主题；标明预印本，提取研究对象、数据集和外部验证范围。 | 官方 Atom 查询 API 已验证：`export.arxiv.org/api/query`，无需凭据的公开查询。描述性元数据 CC0；全文仍按各篇许可处理。所有机器合计单连接、每次请求至少间隔 3 秒。 | 每日 1 次，小查询批次，保留 arXiv ID 与版本。发现渠道稳定协议明确，论文质量另审；**D**。 |
| `openalex-agriculture` OpenAlex：[API](https://help.openalex.org/api/)、[认证](https://help.openalex.org/api/authentication/) | 研发补全。农业期刊论文、作者机构、DOI、开放版本、引用关联；弥补 arXiv 对农学覆盖不完整。以 DOI/arXiv ID 跨源去重，追溯到原论文，不把索引摘要当独立验证。 | 正式 `https://api.openalex.org/works` 已验证。当前官方文档允许无 key 的基本查询，持续使用建议免费 key；免费预算和增量能力需依当时套餐。元数据 CC0，不等于论文全文 CC0。 | 每日或每周 2–3 次。结构化元数据适合补全，收录/作者归属错误仍可能存在；**D**。 |
| `github-agriculture-tools` GitHub：[搜索 API](https://docs.github.com/en/rest/search/search)、[限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) | 研发工程线索。农业遥感、作物模型、水质预测和数字孪生开源项目；先主题发现，再维护人工精选仓库的 release/commit/watchlist。高 star 不等于农业效果经验证。 | 正式 REST API 已验证，公开仓库可匿名；常规匿名上限 60 次/小时，认证通常 5000 次/小时，搜索另有限流。凭据只在服务器；代码/模型/数据许可证分别登记。 | 每日 1 次候选发现，精选库每周汇总重要发布。元数据可靠，代码科学有效性未验证；**D**。 |

网页来源的共同限制：本次只证明来源页面存在及部分内容可读；未证明站方提供 RSS、开放 API、批量下载许可或生产可用 SLA。先以原文链接、短摘要、适用条件和版本引用为主。每个适配器进入 enabled 前都应补齐来源条款记录、访问测试和失败策略。

## 备选来源，首轮不额外扩量

- **湖北省气象局**：[官方站](https://hb.cma.gov.cn/)。已验证站点与天气栏目；其首页链接公众天气和预警服务。作为湖北天气解释和和风数据来源核对入口，暂无已验证结构化 API，不替代和风主适配器。
- **鄂州市水雨工情**：[梁子湖水位通报示例](https://www.ezhou.gov.cn/syts/zntj/202607/t20260707_770878.html)。可补充湖区背景；新闻中的梁子湖水位不等于养殖塘水位，更不能直接复制设防/警戒水位为塘口阈值。只有农场确认水系关系并取得稳定接口或栏目后纳入自动流程。
- **中国农科院资源区划所**：[遥感与智慧农业成果](https://iarrp.caas.cn/kjkf/yyjzcg/index.htm)。已验证含作物分类、干旱监测、雷达土壤水分、过程模型等；可在种植/遥感研发需求明确后替换或扩展华农来源。成果展示不等于开放模型/API 或可用源码。
- **梁子湖区政府**：[基层农技推广方案](https://www.liangzh.gov.cn/lzhxxgk/jczwgkbzh/snbtly/202512/t20251219_740514.html)。用于确认本区主推技术和后续农技验证资源；仍需由用户确认本场实际品种，不能以地区概况推断平台里的生产对象。

## 建议直接进入执行计划的约束

1. **经营证据与研发线索分流**：`operational_evidence`、`research_lead`、`reference_knowledge` 分开。研发文章默认不能生成农事操作建议；新闻关键词命中也不能提升为专业规则。
2. **先登记后启用**：首批全部从候选开始，`enabled:false`；解析/授权条件合格后进 `shadowMode:true`，验证成功才进入正式报告。保留 `verificationStatus`、`lastVerifiedAt`、`termsStatus`、`authRef`、`freshnessPolicy`、`regionScope`、`species/crop`、`productionSystem`、`sourceVersion`。不要把未来字段误写为当前 SourceDef 已支持。
3. **先测 4 条窄路径**：和风日预报/预警两类响应 fixture、湖北水产管理措施、鄂州列表与正文、arXiv/OpenAlex 同篇论文去重。和风日预报复用已有解析契约，预警的新增/更新/取消另建测试。这个组合覆盖天气上下文、实时事件、专业知识、地方新闻和研发索引；NATESC 访问稳定性未证前不作为阻塞项。
4. **保留原始发布者和适用性**：同一湖北文件被鄂州转载只算一条原始证据；地区、物种、作物阶段、养殖模式、发布时间、有效期缺失时标记 unknown，不能自动补齐。抽取摘要要能回指原文段落或附件页码。
5. **水产与种植共同演示场景**：建议独立测试采用“区域强降雨 + 模拟塘口/地块状态 → 防汛巡检关注项和数据缺口”；不预设温室，不预设实际养殖的是武昌鱼/河蟹/小龙虾，不输出未经本场验证的用药量、放养密度、增氧控制量。
6. **复用日预报，另加预警契约**：平台已登记 `QWEATHER_CONTRACT='qweather-weather-v1-daily-20261002'`，`readDaily()` 调用 `/weather/v1/daily/{latitude}/{longitude}`，采用 Ed25519 JWT。它是日预报管线，不能据此声明自动预警已接入。后续新增 weatheralert v1 适配器，规范化 `id`、`messageType.code` 的 alert/update/cancel、`supersedes`、`effectiveTime/expireTime`，再提供稳定的内部事件契约。日预报和预警各自保留 schema 版本和 fixture，并验证纬度/经度顺序、更新/取消和失败降级。
7. **失效与失败不同**：只有成功查询才能解释“无有效预警”；超时、鉴权失败、限流均表示未知，不能清除已知风险。取消、更新、过期要保留事件历史，不沿用普通资讯的长周期 URL 排重。
8. **复用已有来源归因**：平台 `normalizeDaily()` 已验证并保留 `metadata.attributions`，AgriTwin 消费日预报时沿用该字段，新增预警适配器也保留相应归因。和风[归因要求](https://dev.qweather.com/docs/terms/attribution/)的通用页面仍出现旧版 `refer.sources`，这不表示平台使用旧版；实施按已确认的 weather v1 / weatheralert v1 响应契约将来源继续传到 UI。

建议首轮来源验收：每源 3–5 份正常样例与至少 1 个空页/改版/超时案例；保证标题、发布者、原文 URL、时间语义、适用对象的提取可追溯，重复转载不重复出建议，预警取消不被去重吞掉。运行频率与健康指标在真实来源测试完成后再定，不用本次浏览结果声称 95% 等采集成功率。

## 平台源码核验

核验文件：src/adapters/qweather/client.ts（原本地引用：`liangzihu-farm-platform/src/adapters/qweather/client.ts`；目标未随本次文档归档上传）。第 4 行登记日预报契约版本，第 17–20 行实现 Ed25519 JWT，第 28–32 行规范化日预报并保留归因，第 34–40 行调用 weather v1 daily，第 42 行从环境读取签名配置。已检查的和风适配器目录没有 `weatheralert` 调用。本次确认的是代码实现边界，没有验证生产账号、配额、调度执行或在线响应。

## API 与许可核验补充

- 和风官方[认证](https://dev.qweather.com/en/docs/configuration/authentication/)支持 JWT 和 API KEY；农场平台实际已实现 Ed25519 JWT 和专用 API Host 校验，应沿用这套配置边界。现有账号授权范围、配额及天气预警产品权限并未核验。
- OpenAlex 当前[认证说明](https://help.openalex.org/api/authentication/)与[价格说明](https://help.openalex.org/access/pricing/)已经不同于早期“全部免费/固定每日请求数”的旧教程：基础匿名查询可以使用，免费 key 增加预算；方案不写死旧教程配额。
- arXiv 描述性元数据许可和论文全文许可分开；官方要求所有调用客户端整体遵守 3 秒间隔与单连接约束，不能用并发源绕开限制。
- 官方机构内容的权威性和访问适配器的可靠性是两个独立维度；后者必须通过实际离线 fixture 和小规模访问测试确认。
