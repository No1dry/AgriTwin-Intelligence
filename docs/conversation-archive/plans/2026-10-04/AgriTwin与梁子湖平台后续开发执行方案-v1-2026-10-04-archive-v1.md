> 文档归档副本｜原文日期：2026-10-04｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# AgriTwin 与梁子湖平台后续开发执行方案

> 执行进展（2026-10-04）：第 1—8 步已完成离线闭环，第 9 步已完成两个官方农业来源的有限实抓及独立报告，109 项测试通过。当前状态以[第9步执行结果](../../acceptance/2026-10-04/%E7%AC%AC9%E6%AD%A5%E6%89%A7%E8%A1%8C%E7%BB%93%E6%9E%9C-2026-10-04-archive-v1.md)为准；[第1—8步记录](../../acceptance/2026-10-04/%E7%AC%AC1-8%E6%AD%A5%E6%89%A7%E8%A1%8C%E7%BB%93%E6%9E%9C-2026-10-04-archive-v1.md)作为历史验收保留。下文保留开工前 V1.1 设计语境；“待实施”及“未执行”不再代表第 1—9 步的当前状态。后续模型、天气扩展与平台接入尚未执行。

版本：V1.1。编写及修订日期：2026 年 10 月 4 日。状态：待实施的农业专用开发方案。

本方案覆盖 AgriTwin Intelligence 的农业改造、现有 135 个信源的处置、新农业来源的接入与使用、独立测试，以及后续接入梁子湖智慧农业平台的代码和验收工作。当前交付是方案与逐源清单，文中新增文件、命令、接口和数据库表均为拟议内容，除标为“现有”的部分外都尚未实现。

本项目按农业专用产品建设：删除现有135条通用信源定义，按农业用途重新建立12个来源组；只复用农业流程实际需要的采集、模型调用和校验能力。先完成“模拟农场数据与外部证据 → 农业报告 → 本地查看”的独立流程。后续由梁子湖平台提供授权后的事实快照，并继续负责对象权限、专业审核、任务、发布与通知。AgriTwin 提供外部情报处理、适用性判断和有证据的候选解释。

## 1 阅读依据和已确认的项目状态

审阅对象为两个仓库的 main 分支源码快照。AgriTwin 获取并校验了全部 108 个跟踪文件；梁子湖平台按集成需要选取并校验了 101 个文档、路由、服务、迁移及测试文件，没有声称审计整个平台。文件按 Git blob SHA1 校验。

| 仓库 | 本次目录树标识 | 与方案有关的事实 |
|---|---|---|
| [AgriTwin Intelligence](https://github.com/No1dry/AgriTwin-Intelligence) | `b9bb293200490983af60e60469fb350febe07049` | Node.js 与 TypeScript CLI；已继承采集、摘要、编辑、审稿、静态报告；农业模块未实现；没有活动 Actions |
| [梁子湖平台](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform) | `9995fc20cd84093adcaa3fab954ffe9d08b9f45a` | Next.js、React、PostgreSQL；已有对象、测值、天气、知识、助手、简报审阅、任务与后台作业代码 |

上述标识是 tree SHA，不是 commit SHA。实施开始时重新记录实际 commit SHA、锁文件哈希和测试环境；本方案不把仓库中的历史验收记录当成本次重新运行的结果。

关键源码依据：

- [AgriTwin 项目范围](https://github.com/No1dry/AgriTwin-Intelligence/blob/main/README.md)、[原农业方案](https://github.com/No1dry/AgriTwin-Intelligence/blob/main/docs/agriculture-digital-twin-integration-v1.md)。
- [平台对象类型](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/modules/registry/objects.ts)：`farm / pond / field / channel / facility`，以 UUID 和父子对象关系组织。
- [平台生产批次](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/modules/registry/batches.ts)：包含 `species / variety / stage / verified / started_at / ended_at / supersedes_id`。
- [平台测值查询](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/modules/telemetry/queries.ts)：保留采样、上报、接收时间，质量、冲突、canonical、映射版本和数据状态。
- [平台简报服务](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/modules/briefings/service.ts)：程序生成事实项，逐条采纳、修改或驳回；采纳后才能转任务草稿。
- [平台和风适配器](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/adapters/qweather/client.ts)：已实现 weather v1 日预报、Ed25519 JWT、来源归因；本次未见 weatheralert 自动接入实现。

## 2 首版目标与职责分工

首轮暂按“塘口水质与数据质量关注，结合区域强降雨预报”作为主测试场景，再用一个地块对象验证领域兼容性。实际鱼种、作物、面积、坐标和设备能力尚未确认；fixtures 必须标明合成样本。此处是测试顺序建议，不把温室或任何养殖品种当作既定现场事实。

首版应交付五项可检查成果：农业 JSON 协议、可重放的模拟数据、来源与证据索引、可查看的本地报告、与梁子湖格式对齐的候选结果包。允许当天没有风险事项，也允许证据不足时只输出缺口。

| 能力 | AgriTwin 负责 | 梁子湖平台负责 |
|---|---|---|
| 外部农业资讯与研究 | 采集、正文提取、来源去重、适用条件、技术情报摘要 | 展示获准导入的内容及其引用 |
| 本场对象和生产批次 | 消费已授权快照，保留原对象 ID | 台账、批次、空间映射、授权和更正历史 |
| 传感器与业务事实 | 检查输入是否满足本次解释条件 | 设备接入、测值质量、原始记录、程序指标、告警 |
| 天气 | 独立阶段用 fixture；解释气象证据及有效期 | 后续复用已有日预报连接，新增正式预警适配 |
| 专业知识 | 形成待审核的资料候选，保留版本和适用范围 | 知识审批、访问控制、检索和撤回 |
| 报告 | 独立农业报告；集成后输出附加候选事项 | 原程序事实项、人员逐项审阅、角色化展示 |
| 任务和对外发布 | 只给候选动作与依据 | 人工确认、任务草稿、派发、发布范围和通知 |
| 模型运行 | 统一调用路由、角色编排、输出硬校验 | 集成时控制数据外发许可、对象预算、作业租约与用量账 |
| 实时保护 | 消费其结果，不承担实时控制 | 保持原告警和控制系统的独立运行 |

首版不重做平台已有的知识库、用户登录、权限、设备采集、地图或任务系统。农业业务新增内容集中在“外部证据如何与本场事实结合”。

## 3 删除旧信源并重建农业来源

执行决定：现有135条定义全部从AgriTwin的运行配置中删除，原样保留0条。开发树不设置upstream profile，不维护停用的通用来源归档，不承诺继续生成科技、财经、时政日报。来源选择以具体农业用途和可验证获取方式为准。

| 原配置 | 登记数 | 原全局启用数 |
|---|---:|---:|
| `sources.config.json` | 68 | 41 |
| `sources.candidates.json` | 67 | 67 |
| 合计 | 135 | 108 |

原分类为科技 110、财经 14、时政 11；中文模式按原 locale 配置启用 106 个。“启用”仅表示配置值，未证明实际抓取成功。当前 registry 会合并两份配置，名称为 candidates 的文件不能被当作天然隔离的候选池。

处置分类互斥，合计135条：

| 执行动作 | 原定义数 | 结果 |
|---|---:|---|
| 删除，无直接替代订阅 | 132 | 从运行配置、来源说明和适配器路由引用中移除 |
| 删除旧定义，重建农业定向来源 | 3 | 两条arXiv泛类别源合为一条农业查询；GitHub全站热榜改为农业主题与精选仓库源 |
| 原样保留 | 0 | 不留下旧来源启停列表 |

三条重建映射为：`arxiv-cs-ai`与`arxiv-cs-lg`删除，新增`arxiv-agriculture`；`github-trending`删除，新增`github-agriculture-tools`。新定义不继承旧栏目、热度筛选或泛主题查询。它们是第4节12个农业来源组中的两组，不额外增加来源总数。

OpenAlex另建`openalex-agriculture`农业论文查询。原来的技术人物作者订阅全部删除；原适配器中的HTTP、作者/论文元数据解析只有在新实现确实需要时才抽取复用。DeepMind、Hugging Face、OpenReview、科技媒体等旧订阅同样删除；未来出现具体农业研究需要时，登记该论文、农业专题或明确的模型/数据集，避免恢复泛AI全站流。

财经14项、时政11项、社区、X热点、融资目录、泛技术人物订阅均删除。农业价格、投入品成本或地方补贴若以后需要接入，再以地区、品类、规格和生效时间定义正式农业来源。

135项逐行理由与替代映射见[现有信源处置清单](../../reference/2026-10-04/%E7%8E%B0%E6%9C%89%E4%BF%A1%E6%BA%90%E5%A4%84%E7%BD%AE%E6%B8%85%E5%8D%95-2026-10-04-archive-v1.csv)。它是一份待执行删除清单，保留原始事实用于核对；不是新产品的运行来源目录，也不代表当前已实施删除。

### 农业配置的最终结构

```text
config/sources.agriculture.json   唯一农业来源目录，登记第4节12个来源组
config/agriculture-profile.json   农业主题、地区/对象条件、采集限额和报告策略
```

删除根目录`sources.config.json`与`sources.candidates.json`。`lib/sources/registry.ts`改为只读取农业目录；删除旧的两文件合并、旧来源fallback和上游兼容导出。未找到配置时明确失败，不回退旧源。无需新增第二个registry或来源profile切换层。

新农业来源的验证状态可为registered、fixture_tested、fetch_verified、selected；运行状态为shadow或active，未具备接入条件时明确unavailable。尚在调试的农业来源记录其具体缺口；确认不适合农业的来源从目录删除，不长期积累禁用项。无凭据、请求失败与成功零结果必须分开。

来源配置删除与调用方修改在同一工作包完成。Git历史及精简的`UPSTREAM.md`保留代码出处，MIT许可与署名保留；应用目录不复制一套旧信源或旧日报作兼容。已有审阅快照仅用于本次研究核对，不随农业产品发布。

## 4 新增农业来源和接入次序

建议先登记 12 个来源组：经营与现场解释 7 个，研发与背景知识 5 个。先把其中少数路径测通，不同时开启全部来源。下表频率是建议值，须服从来源条款、账户额度和实测更新周期。

| 来源组及建议 ID | 内容与用途 | 获取方式和当前核实程度 | 建议次序 |
|---|---|---|---|
| 湖北水产推广 `hubei-fisheries-extension` | 池塘、稻渔防灾与巡检依据 | [官方技术正文](https://hbnysy.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202607/t20260710_5974033.shtml)可读；HTML，未验证 RSS/API | 第一批；每日监测，先选样例 |
| 鄂州农业农村局 `ezhou-agriculture` | 本地农情、种植水产防灾、政策线索 | [公开栏目](https://nyj.ezhou.gov.cn/xwzx/gzdt/)；列表与正文提取待开发 | 第一批；每日，识别转载 |
| 湖北农业农村厅 `hubei-agriculture` | 作物农时、技术指导、地方政策 | [部门动态](https://nyt.hubei.gov.cn/bmdt/)；HTML/附件，未验证 RSS/API | 第二批；每日 |
| 和风天气 `qweather-weather-alerts` | 日预报及有效预警上下文 | [预警 API](https://dev.qweather.com/docs/api/warning/weather-alert/)有正式协议；需要账户/凭据，未在线联调 | 第一批先 fixture；后续复用平台天气管线 |
| 中央气象台 `nmc-agrometeorology` | 农业气象与区域灾害背景 | [农业气象产品](https://www.nmc.cn/publish/agro/disastersmonitoring/Agricultural_Drought_Monitoring.htm)；图文产品，未验证业务 API | 第二批；每日，图像产品需复核 |
| 全国农技中心 `natesc-crop-guidance` | 病虫趋势、墒情、种植技术候选 | [官方站](https://www.natesc.org.cn/Home/)；本轮直接读取曾失败，标候选 | 第二批；先人工精选资料 |
| 农业农村部渔业局 `moa-fisheries-guidance` | 养殖防灾基础知识及版本更新 | [2025 版指导页](https://yyj.moa.gov.cn/tzgg/202507/t20250725_6476015.htm)与附件；检查后续替代版本 | 第二批；基础资料入库后每周复核 |
| 华中农大水产学院 `hzau-fisheries-research` | 淡水养殖、健康与尾水研究 | [科研服务](https://cf.hzau.edu.cn/kyfw.htm)；校方资料追溯原论文 | 第二批；每周两至三次 |
| FAO `fao-integrated-aquaculture` | 稻渔、复合种养背景知识 | [公开资料](https://www.fao.org/4/a0823e/a0823e00.htm)；逐份记录年代、地区与许可 | 第二批；人工精选，月度复核 |
| arXiv `arxiv-agriculture` | 农业感知、遥感、数字孪生、水质预测论文 | [官方查询 API](https://info.arxiv.org/help/api/user-manual.html)；标明预印本 | 第一批；每日小批量 |
| OpenAlex `openalex-agriculture` | 农学论文与 DOI、机构、开放版本补全 | [官方 API](https://help.openalex.org/api/)；摘要可能缺失，不能伪造 | 第一批；与 arXiv 做跨源去重 |
| GitHub `github-agriculture-tools` | 农业工具、数据与模型的工程发现 | [官方搜索 API](https://docs.github.com/en/rest/search/search)；发现后转精选仓库清单 | 第二批；日报发现、周报版本摘要 |

12 个来源组不等于 12 个已可用采集器。详细链接、凭据、许可、适用条件、频率与验证状态见 [农业来源调研](../../research/2026-10-04/agriculture-source-discovery-2026-10-04-archive-v1.md)。湖北气象局、鄂州水情、中国农科院资源区划所、梁子湖区政府作为后续备选，不计入首批 12 个。

arXiv 须遵守官方单连接及请求间隔要求；OpenAlex 和 GitHub 使用各自的额度与退避规则。机构网页不假定有 RSS，不调用未公开的内部接口；附件能读取不等于可全文再发布。对外展示以出处、短摘要和适用条件为主。

### 首轮具体做哪几条

1. 天气 fixture：覆盖预报、预警新增、更新、取消、过期、成功无预警、请求失败七种状态。
2. 湖北水产资料：选 3–5 篇可追溯正文，提取养殖模式、适用天气、地区和限制。
3. 鄂州地方栏目：选列表和正文样例，验证正文解析、时间提取及省级转载去重。
4. arXiv 与 OpenAlex：选同一论文的两种记录，验证 DOI/arXiv ID 去重、摘要缺失和研发分流。

这些 fixture 路径可全离线完成。真实来源 smoke 另用显式命令，只请求指定来源，不调用模型或农场平台。旧arXiv泛类别流和GitHub热榜删除后，仅运行新的农业查询；可复用底层解析和限流能力，不能同时保留旧查询造成重复抓取。

## 5 信源如何进入报告和农场流程

系统要区分内容类型、可信来源和本场适用性，不能只依靠关键词匹配。

| 输入类别 | 可进入的结果 | 必须保留的限制 |
|---|---|---|
| 农场有效观测和程序指标 | 本场状态、数据缺口、待核事项 | 对象、指标、单位、采样时间、质量、版本 |
| 天气预报与区域预警 | 潜在影响、关注窗口、核实事项 | 区域尺度、有效期、更新/取消；不冒充现场测值 |
| 官方农技和水产指导 | 待审核知识、适用条件及巡检依据 | 作物/物种、生育期、养殖模式、地区和版本 |
| 农业政策 | 地方政策摘要、申报线索 | 正式文件、适用主体、地区、期限；不自动判定符合条件 |
| 论文与开源项目 | 研发情报、待验证技术路线 | 数据集、方法、许可证、验证范围；不自动生成农事操作 |
| 机构新闻或媒体转述 | 发现线索，补查原始来源 | 不作为独立实测或农艺阈值证据 |

确定性处理顺序为：采集原文与元数据 → 规范化 → 识别版本与转载 → 区分经营/知识/研发用途 → 提取适用条件 → 与授权对象和批次匹配 → 检查质量及时效 → 执行获准规则 → 生成候选解释 → 程序校验 → 模型复核 → 保留待审结果。

适用性结果采用 applicable、not_applicable、unknown。地区、批次或生育期缺失时返回 unknown，不能由模型猜测填补。地区新闻命中“梁子湖”不能证明与某个塘口有水系连接；省级高温预报不能推出某塘水温；论文报告准确率不能作为本场模型准确率。

同一技术文件被湖北、鄂州网站转载时归入同一原始证据组，保留转载链接但不增加独立佐证数量。论文按 DOI、arXiv ID 和版本关联。天气按发布者事件 ID、版本、supersedes 和取消关系处理，不沿用普通新闻的 URL 长周期排重。

示例：湖北发布防汛指导，预报显示某区域有强降雨，模拟塘口最近观测过期。报告应说明“存在区域天气关注，本塘当前状态无法确认，需补充观测并核查设施”，列出天气、文件和数据缺口的引用；不能写成“本塘已经缺氧”或发出设备控制动作。研发论文在同日报的技术栏目展示，不参与该塘口异常定级。

## 6 独立运行架构和数据协议

保持 AgriTwin 的 CLI 形态，首版不增加 Web 框架、数据库或常驻 API。先用版本化 JSON 和本地文件存储完成可复现测试。持久文件写入采用临时文件加原子替换；一次运行使用独立 runId，完成标记最后写入，进程中断留下 incomplete 状态。

输入为 FarmSnapshot 与 ExternalEvidence；输出为 FarmBrief、AgriTwinCandidateBundle、EvidenceIndex 和 RunManifest。本地 HTML 只供查看这些产物，不兼任对外发布站点。

| 协议 | 必要字段和约束 |
|---|---|
| FarmSnapshot v1 | installationId、farmObjectId、authorizedObjectIds、snapshotId/hash、capturedAt、window、timezone、objects、batches、observations、metrics、weather、tasks、records、limitations |
| ObjectRef | system、installationId、objectId、kind、version；保留平台 UUID；三维资源 ID 可选 |
| Observation | observationId、pointId、objectId、sampledAt、reportedAt、receivedAt、metric、value、unit、quality、origin、canonical、conflicted、bindingId；缺值用 null |
| ExternalEvidence | evidenceId、sourceId、kind、originalPublisher、canonicalUrl、publishedAt、retrievedAt、validFrom/Until、version/hash、applicability、rawReference、reviewState、usageRights |
| FarmBrief v1 | reportId/version、snapshotId/hash、profileHash、window、coverage、overview、attentionItems、needsVerification、taskProgress、technicalItems、evidenceIndex、qualityReview、validUntil |
| CandidateBundle v1 | bundleId/version、contractVersion、producerVersion、snapshotId/hash、authorizedObjectIds、items、externalEvidence、runManifestHash；仅包含候选，不包含人员审批决定 |
| CandidateItem | stableKey、objectRefs、kind、text、factRefs、evidenceRefs、requiredLimitations、applicability、validUntil、suggestedCheck；无 evidence/fact 的事项拒收 |
| RunManifest | 代码/配置/协议版本、输入哈希、来源状态、模型调用记录、预算、起止时间、错误、输出哈希和 fixture/live 标识 |

当前平台采用对象授权，没有依据要求第一版新增 tenant 数据库体系。使用 installationId 作为跨系统命名空间，真实授权仍由平台对象权限完成。批次映射为平台 production_batches，不按显示名重建“1号塘”。未验证批次不提供已确认的物种、生育期判断。

时间窗口统一为左闭右开，存储明确UTC偏移的时间，展示使用农场IANA时区；发布时间未知时保留null，不能拿抓取或接收时间代替。比例、百分数及物理量分别声明单位；只做白名单内可复算的单位转换，保留原值、原单位和转换版本。

以农业SourceKind、通用CollectedItem和FarmBrief取代旧`Category = tech | finance | politics`及`DailyReport`协议。迁移仍有用的低层解析函数，使其返回不带旧栏目语义的采集记录；农业入口不依赖长期RawArticle兼容bridge。观测、天气和任务继续使用各自的结构化协议，不强转为文章。旧协议及其最后一个调用方在同一清理工作包删除。

每条模型结论必须引用本次允许的证据 ID。数值、单位和阈值从结构化程序结果引用；硬校验同时检查对象、时间、量纲、证据有效性和适用条件。仅检查“数字在原文中出现”不足以证明该数字属于正确指标。原文、模型摘要和人员审核结果分别保存。

## 7 AgriTwin 代码改造清单

以下为实际开发时的文件级任务；按阶段创建已实现文件，避免一次建出大量空壳。

| 工作包 | 文件及改动 | 交付与依赖 |
|---|---|---|
| A01 基线 | 更新 `README.md`、`AGENTS.md`、`.gitignore`、`UPSTREAM.md`，增加独立测试说明 | 记录一次改造前参考基线；产品范围统一为农业，保留许可和出处，清除原日报安装说明 |
| A02 来源重建 | 重写 `lib/sources/registry.ts`、`lib/sources/dispatch.ts`、`lib/sources/types.ts`；加 `lib/sources/schema.ts` 和第3节两份配置；删除两份旧来源JSON | 删除135旧定义；单一农业registry；按显式adapter路由，未知adapter直接报错，不回退RSS |
| A03 领域协议 | 加 `lib/agriculture/types.ts`、`schema.ts`、`contracts/*.json` | 使用现有 zod 校验；独立协议版本和兼容性检查 |
| A04 输入适配 | 加 `adapters/types.ts`、`fixture.ts`、`bundle.ts` | 同一接口读取 fixture 或授权文件包；稳定ID，无平台依赖 |
| A05 上下文与质量 | 加 `context.ts`、`quality.ts`、`snapshots.ts`、`validation.ts` | 批次验证、时间窗口、单位白名单、质量/冲突/过期处理；首份程序报告出口即执行硬校验 |
| A06 证据 | 加 `evidence.ts`、`provenance.ts`、`applicability.ts` | 原始证据与摘要分离，地区/物种/阶段适用性，引用索引 |
| A07 事件 | 加 `events.ts`、`rules/types.ts`、`rules/fixture.ts` | 更新/取消/解除、重复消息；测试规则明确标为 test_only |
| A08 农业采集 | 加 `collector.ts` 及农业适配器；复用A02唯一registry；重构 `lib/sources/rss.ts` 等低层解析 | 采集记录去除旧Category；HTTP/RSS/HTML能力按实际引用保留；原文与contentText完整传递 |
| A09 农业论文 | 新增农业arXiv/OpenAlex查询；重写 `lib/papers/curation.ts`、`lib/ai/paper-semantic-review.ts` 的领域逻辑；删除旧作者订阅适配 | 作者与真实摘要分字段；摘要缺失可见；农业主题和方法评价；不再调用旧daily.ts |
| A10 模型接口 | 加 `ai/client.ts`、`ai/prompts.ts`、`ai/mock.ts`；扩展 `lib/ai/llm.ts` 的LlmRunResult及三个backend实现 | 注入式mock；真实调用继续统一runLlm；补可选usage与unknown状态，支持剩余时长与取消 |
| A11 农业流水线 | 加 `pipeline.ts`、`reviewer.ts`、`budget.ts`；复用A05的 `validation.ts` | 初稿、返修、fallback和最终输出均执行同一硬校验；有限预算 |
| A12 输出 | 加 `store/filesystem.ts`、`lib/output/render-agriculture.ts`、`export-bundle.ts` | 独立HTML/JSON/manifest；脚本和URL转义，允许协议白名单 |
| A13 命令 | 加 `scripts/agriculture-daily.ts`、`agriculture-sources.ts`、`agriculture-validate.ts`、`render-agriculture.ts`；改package脚本 | fixture为默认；采集、生成、查看分别执行；错误退出码明确 |
| A14 测试 | 加 `tests/agriculture/*.test.ts`、`fixtures/agriculture/*`、契约和黄金结果；扩展tsconfig或新增 `tsconfig.test.json`；加 `scripts/check-agriculture.ts` | 见第11节矩阵；测试文件也纳入类型检查，脚本显式枚举并通过tsx与node:test执行，避免依赖Windows通配符展开；全离线测试不读取机器模型凭据 |
| A15 旧流程退役 | 抽取有用函数后移除旧 `lib/ai/pipeline.ts`、日报模板、交易、通知/部署包装器和旧栏目检查；清理依赖/锁文件/文档 | 农业代码类型检查和测试通过；没有旧源、三栏目、交易或上游调度的可达入口 |

新增农业目录建议以 `lib/agriculture/` 为根；表中新建农业业务文件省略根路径时位于该目录。既有文件、脚本、配置和测试路径按完整路径列出。来源定义仍在 JSON，不能散落到 TS 硬编码。

第一份报告之前必须完成 A02–A07 与硬校验。A09在启用农业论文来源前完成。A10–A11可在确定性报告跑通后加入；模型不是离线演示的前置条件。A15与相关替换工作同步推进，在S2交付前完成旧运行入口退役，在S4完成剩余模型函数迁移后的无引用代码清理。

### 同步删除和复用的代码范围

仅删除JSON会使现有代码在导入registry时失败；清空数组也无法解决旧日报的固定栏目、交易调用和数量门禁。按依赖关系执行以下清理，每个交付批次保持类型检查和农业测试可通过：

| 范围 | 动作 |
|---|---|
| `sources.config.json`、`sources.candidates.json` | 删除；农业来源仅存放于 `config/sources.agriculture.json` |
| `lib/sources/registry.ts`、`dispatch.ts`、`types.ts` | 重写为农业协议和显式适配器映射；删除旧sourceId分支及API误回退RSS路径 |
| locale与时区依赖 | 将REPORT_LOCALE等运行配置移到无采集副作用的 `lib/runtime/config.ts`；`lib/utils.ts`继续提供统一日期工具，纯模型/渲染测试不加载来源目录 |
| 通用网络与正文处理 | `fetch-utils.ts`、`curl-fetch.ts`、RSS解析、HTML正文处理、URL规范化及退避按农业实际引用保留；公共接口接受农业SourceDef或无领域参数 |
| 社区、热点与融资专用适配器 | 删除hackernews、v2ex、linuxdo、attentionvc、crunchbase、ycombinator等专用文件和dispatch分支；X/视频/人物/热榜适配器没有农业用例时一并移除 |
| GitHub与学术接口 | 复用必要HTTP/API解析能力，创建农业查询和精选库适配；删除全站热榜、泛作者订阅与旧相关性规则 |
| `lib/trading/`及行情评论 | 删除，连同 `lib/ai/trading-commentary.ts`、`scripts/regen-trading.ts`、金融相关配置和依赖 |
| 旧DailyReport生成与展示 | 有价值的JSON恢复、引用校验、有限重试抽成通用函数后，删除旧三栏目pipeline、prompts、enrichment分组及 `lib/output/render.ts`；以FarmBrief生成和农业模板替换 |
| 旧CLI及发布 | 删除/替换 `scripts/daily.ts`、`dry-run.ts`、`render.ts`、`regen-enrich.ts`、`run-daily.mjs`、`deploy.mjs`、`notify-*.mjs`、`build-site.mjs`、旧open-report；package只保留农业及通用检查命令 |
| 安装与上游工作流 | 删除 `bootstrap.mjs`、旧install/uninstall及 `ops/upstream-workflows/`；不携带旧定时任务、部署仓库和推送配置 |
| 编辑配置与测试 | 以农业配置取代AI Frontier及Console能力声明；删除仅验证3/3/2栏目、原科技主题或旧通知的测试；保留并改造网络、解析、模型路由、引用和返修等通用测试 |
| 文档、脚手架和依赖 | 更新sources/readme生成脚本只读农业目录；删除无用旧截图、原运行指南、旧代理技能命令与失效链接；保留LICENSE和精简UPSTREAM；按引用清理package与lockfile |

函数复用以农业测试证明仍有用途为准。不得把删除的旧配置改名放入legacy目录，再让应用或发布包携带一整套旧产品。Git历史可供日后查阅，不需要长期维护旧DailyReport兼容层。

### 模型和质量门的具体要求

- 将inputMode与llmMode分开：输入可为fixture或授权snapshot，模型可为mock或live。默认offline预设为fixture+mock+禁止网络，检测到网络尝试即失败。显式live小样本允许使用公开/合成fixture，但仅开放指定模型网关，不开放来源、平台或通知网络；避免默认为本机Claude登录或环境里的模型凭据。
- reviewer 分数、确定性检查和人工审核是三个独立状态。硬失败不能被高分覆盖，模型通过仍只生成待审候选。
- 农业首版默认最多两轮内容审查，可配置但同时受总调用数、token和时长限制；记录实际停止原因，不机械继承四轮默认。
- 建议小样本运行上限为 1 个农场、2 个分析目标对象、10 条外部候选、8 次真实模型调用、180 秒；父农场和只作上下文的对象不占目标数，较大的fixture集合可分次验证。均为可调工程预算，实际模型延迟未测。预算耗尽保留可验证的程序结果和诊断，不追加调用直至通过。
- 每次调用超时取配置超时与剩余总时长的较小值；传递AbortSignal，CLI后端超时终止本次子进程。关闭SDK不可见的自动重试，由编排器逐次计入attempt预算。固定Clock注入新鲜度、有效期、窗口和生成时间判断，测试不能混用真实Date.now；耗时预算使用独立单调时钟，避免冻结业务时间导致超时永不发生。
- 将 LlmRunResult 扩展为可选用量、请求ID和结束原因；无法获得用量时记 unknown，不把现有 `tokensUsed:0` 当成零费用。成本使用当次有日期的配置，不能在计划里写死服务商价格。

## 8 梁子湖平台的现有接口和新增边界

现有路由应作为字段与行为依据，但它们主要服务已登录用户。readApi 使用 requireActor；写入还检查 Origin 并进入事务。不能假设给现有路由加一个 Bearer token 就能做机器接入。[平台API包装](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/platform/api.ts)

| 现有接口 | 已有用途 | 对接时的限制 |
|---|---|---|
| `GET /api/v1/objects` 及对象详情 | 有权限的对象列表与业务数据 | 复用原UUID与授权，不只靠传入farmId |
| `GET /api/v1/points/{id}/readings` | 指定时间窗的测值、当前值、数据状态和游标 | 现有限制31天、每页最多500；先验证授权和映射 |
| `GET/POST /api/v1/weather` | 查询或登记天气记录 | POST是写入；独立测试不调用；已有warning记录类型不等于已接通自动预警源 |
| `GET/POST/PATCH /api/v1/knowledge`、search | 查询、资料录入、审核/撤回与检索 | 审核/撤回使用PATCH；新外部资料不能直接变为approved知识 |
| `GET/POST/PATCH /api/v1/briefings` | 列表、从平台事实生成、逐项审阅 | POST不接受任意AgriTwin候选包，需要新增导入服务 |
| `POST /api/v1/briefings/tasks` | 将已采纳/修改事项转任务草稿 | 保留来源有效性与人员权限检查 |
| briefings publications / explanations | 按接收者确认分享、追加模型解释 | 候选包无权指定人员审批、taskId或发布对象 |

表中的方法以本次读到的路由为准；机器只读导出、外部候选导入都要单独定义契约。初期避免增加公网服务端口，采用文件包和平台后台作业的固定 CLI 调用。

## 9 推荐的三步集成方式

### 第一步 独立输入与输出

AgriTwin 从 fixture 或脱敏 FarmSnapshot 文件读取。输出 CandidateBundle 和本地报告；不连接平台数据库、账户、设备、通知目标。此阶段测试的是字段、适用性、证据和失败行为。

### 第二步 人工导入到隔离测试平台

平台新增授权快照导出和候选包导入服务，先通过本地工具或具备所需对象权限的操作人触发测试界面执行。平台admin角色不天然具有record或review权限；导入、知识登记和审阅分别按对应对象动作校验。平台在导出时确定对象范围、actor、授权版本和可发送字段；文件仅在私有任务目录流转。AgriTwin 不能扩大该范围。

建议新增平台文件：

```text
src/modules/agritwin/contracts.ts
src/modules/agritwin/snapshot.ts
src/modules/agritwin/evidence.ts
src/modules/agritwin/import.ts
src/modules/agritwin/bridge.ts
src/app/api/v1/agritwin/imports/route.ts
tests/integration/agritwin-import.test.ts
tests/integration/agritwin-authority.test.ts
```

imports 路由为拟新增的登录用户接口，负责校验和提交后台作业，不在请求内调用模型。请求体限制要显式设置；现有 writeApi 默认32KB，不能把含大量观测或正文的包直接塞进去。建议导入清单与私有附件分离，初版单包上限1MiB、100项候选，超限拒绝并提示拆分；阈值是待测试的工程建议。

数据库采用下一可用迁移号；当前快照到043，不能在并行开发时假设044永远可用。拟新增：

| 表 | 保存内容与关键约束 |
|---|---|
| `agritwin_snapshots` | 授权范围、输入摘要、哈希、协议/配置版本、有效期 |
| `agritwin_runs` | 生成或导入作业、租约、模型/代码版本、执行状态和结果hash |
| `agritwin_evidence` | 外部证据不可变版本、出处、有效期、撤回/替代、审核状态 |
| `agritwin_imports` | producer、bundleId/version、snapshotId、payloadHash、状态；组合唯一约束 |
| `agritwin_item_links` | stableKey、briefing_item_id、证据/快照关系；防重复导入 |
| `agritwin_model_attempts`、`agritwin_model_reservations`、`agritwin_model_receipts` | 后台真实模型阶段新增；绑定run，保存逐次调用、预留、用量/价格快照与人工核对回执；unknown继续占用保守预留 |

同一bundle ID和版本、相同hash重试返回原结果；同ID不同hash返回冲突。修订必须新版本，不覆盖原证据、原事项和人员审批。一个导入事务同时落证据索引、事项和映射，失败整体回滚。

### 第三步 平台后台自动生成待审候选

`workers/intelligence.ts` 增加受控 `agritwin.generate` 作业，复用现有jobs租约、失败和恢复机制。平台生成最小授权快照，经固定程序路径、参数数组和JSON文件调用版本固定的AgriTwin CLI；不用shell拼接用户参数，不从临时审阅目录直接运行生产代码。

AgriTwin 进程只得到本次需要的文件、配置和受限预算，不得到平台数据库密码。集成模式不直接携带云模型密钥：其模型请求经过平台的受控调用代理/本地IPC，由平台在每次调用前检查当前权限、对象model_policy、预算和租约，再统一记账。AgriTwin 独立真实模型小样本仍可使用自己的凭据。两种实现注入同一 LlmClient 接口。

仅靠启动进程前检查一次权限不足以覆盖多轮调用。平台现有 model_reservations 与 assistant_runs 绑定，且原流程通常预留两次调用；新增多轮生成须调整账本关系与每轮预留逻辑，不能直接沿用两次的额度或把未知用量清零。第一版新增AgriTwin运行账本保留原助手历史，预算聚合必须共用对象级锁，合计助手与AgriTwin的实际消耗及全部未结算预留，防止两套流程各自花满同一上限。需要同步修改 `assistant/service.ts` 中可复用的授权/预算逻辑、`operations/budget.ts` 相关接口以及对应迁移和测试，避免在两个模块中复制后各自演化。

任务执行期间不得持有长数据库事务。快照、预算预留、返回结果和导入分别使用短事务；模型和网页请求在事务外。返回时重新核验租约、对象权限、证据状态、预警有效期和输入版本。中断后可能已完成的外部调用记 result_unknown，不盲目再次付费执行。

若将来确需跨主机，复用同一JSON契约再设计私有服务通道、签名和服务身份；该部署变化不应成为首轮独立测试的依赖。

## 10 平台端必须补齐的校验和界面

平台[来源活性检查](https://github.com/8jdkds7nzz-hub/liangzihu-farm-platform/blob/main/src/modules/analysis/evidence.ts)已拒绝未知kind，但它不接收Actor，不能替代权限校验；空refs会返回true；部分来源只验记录存在。新增外部来源时应做以下改动：

1. 在 `analysis/evidence.ts` 显式加入 `agritwin_evidence`，检查确切版本、未撤回/替代、使用目的及有效期；未知kind仍拒绝。历史引用可查阅，但不可作为当前操作依据。
2. 在导入层拒绝无引用事项和已过期snapshot，把factRefs绑定本次授权snapshot及objectId，不能接受外部任意UUID。回传actor、auth_version或authorizedObjectIds不能授予权限，只按平台保存的快照与服务器当前授权决定可用范围。原始observation尚不在现有简报来源白名单内；首版优先引用metric/weather/record等已支持事实。确需引用observation时另加canonical、冲突、质量、绑定与时间校验。
3. weather 的存在性检查不足以支持过期、更新、取消；新增预警版本关系及有效性校验。`briefing_item`递归引用增加深度与环检测。
4. 保留原简报事实项。外部候选只能追加draft事项或关联解释；给已reviewed报告追加draft时，在同一事务恢复pending_review。原审阅记录与已发布快照保持历史状态。
5. 外部候选不允许携带decision、reviewer_id、task_id、publication或设备动作。task-ready类型还需平台认可的本地规则/已审核知识支撑；research_lead和未审核知识不能只因模型高分就转农事任务。
6. `toTaskDraft`、`publishBriefing` 继续在操作前复验权限、当前依据、适用性和有效期。来源撤回后保留历史阅读，阻止继续转任务或发布为现行建议。

界面以现有 `/briefings` 为主，修改 `src/app/(platform)/briefings/panel.tsx` 及必要组件，增加“外部情报候选”“本地事实”“模型解释”的来源标识、证据侧栏、适用条件、生成窗口、数据缺口和模型/人员审核状态。点击对象沿用 `/objects/{id}`；地图定位需基于已登记几何/场景映射，缺坐标时显示缺口，不生成假位置。

外部知识先形成待审文档，复用 `knowledge/service.ts` 的审批和检索。新增来源不应直接进入所有用户的可检索范围，专家仍按现有资源授权查看。

平台代码或文档变更须按该仓库AGENTS更新CHANGELOG、README和docs入口；集成测试只操作agri_test的随机schema。修改Next代码前读取安装版本文档，交付执行相关测试、类型检查和build。

## 11 独立测试环境与验收矩阵

当前阶段的独立运行不需要梁子湖在线服务或数据库。建议执行源码仍放AgriTwin自己的开发仓库；本对话的research目录只是审阅快照。实现时创建独立checkout并固定commit，不能把本目录里的两个快照当作已同步的工作分支。

拟实现的命令如下，当前尚不存在：

```sh
npm run agriculture:check
npm run agriculture:test
npm run agriculture:demo -- --scenario pond-weather --run-id demo-20261004 --clock 2026-10-04T08:00:00+08:00
npm run agriculture:validate -- --bundle artifacts/agriculture/demo-20261004/candidate-bundle.json
npm run agriculture:sources:smoke -- --ids hubei-fisheries-extension,ezhou-agriculture --max-requests 6
npm run agriculture:demo -- --scenario pond-weather --run-id llm-sample-001 --llm live --max-calls 8
```

demo默认使用固定时钟、fixture和mock模型。smoke命令显式联网，只验来源。真实模型命令另外启用并限制预算。输出目录为 `artifacts/agriculture/<runId>/`，以上生成和验证命令指向同一目录；实现时对重复runId执行显式冲突/重放规则，不覆盖旧运行证据。未传runId时自动生成并打印manifest路径。

| 层级 | 测试对象 | 必须覆盖 | 通过标准 |
|---|---|---|---|
| T0 农业重建与清理 | 编译、来源schema、迁移清单 | 135旧定义已删除；唯一农业registry；旧入口/无效import不存在；缺配置和未知adapter拒绝 | 农业及复用函数测试通过；fixture不发网络请求；安装与发布包无旧来源/调度副本 |
| T1 数据质量 | 对象、批次、观测 | 重名异ID、无授权、未验证批次、null、过期、单位错误、时钟偏差 | 不伪造正常/零值；不跨对象关联 |
| T2 事件 | 预警与观测版本 | 重复、乱序、升级、解除、取消、成功空结果、超时 | 更新不被URL去重吞掉；失败不当解除 |
| T3 证据 | 原文、论文、知识 | 转载、缺摘要、错误地区/物种/阶段、过期附件 | 每条结论能回到确切原始版本 |
| T4 模型故障 | 注入mock响应 | 无证据、伪造ID/URL/数值、遗漏限制、截断、空输出、超时、反复返修 | 硬失败全部阻断；预算内停止；诊断可查 |
| T5 本地端到端 | JSON、HTML、bundle | 正常、无事项、仅缺口、研发条目、失败报告 | 文件完整、可重放；标题/链接正确，脚本注入被拒 |
| T6 来源smoke | 选定外部来源 | 正文、日期、空页、429、改版、PDF失败 | 记录真实结果；HTTP200不等同成功提取 |
| T7 真实模型小样本 | 公开/合成输入 | 引用一致性、对象归属、解释限制、成本与用时 | 人工逐条核对；不拿自评分当准确率 |
| T8 平台契约 | 本地mock或隔离测试库 | 越权、重复包、hash冲突、权限撤回、来源失效、任务重复 | 事务与幂等通过，原事实和审批不被覆盖 |

第一轮建议准备1个合成农场、2个塘口、1个地块，7天小时级历史及异常样本。边界、物种和批次均明确模拟，养殖/作物阈值由test_only规则提供，界面不得把它们标为本场已批准规则。真实批次资料补齐前，正式操作建议功能保持不可用。

第一轮至少准备30个自动化场景：质量与对象8个、适用性6个、事件6个、模型故障6个、输出与幂等4个。测试断言业务结果和禁止行为，不只断言JSON字段存在。通过条件为上述危险错误在固定测试集上零通过，同时保留测试集范围；这不等于现场误判率为零。

## 12 交付阶段和执行顺序

| 阶段 | 任务与依赖 | 必须交付 | 进入下一阶段的条件 |
|---|---|---|---|
| S0 固定基线 | A01，核对锁文件并记录一次原检查结果 | 改造前参考、源码分支、删除清单、农业测试命令 | 基线问题有记录；不触发旧调度，不把旧日报行为列为迁移后兼容目标 |
| S1 协议和模拟输入 | A02–A07及相应A15清理，依赖S0 | 删除旧来源、农业目录、FarmSnapshot/FarmBrief schema、fixture、质量/适用性逻辑 | 类型检查通过；全离线生成程序报告；无隐式外部请求 |
| S2 本地报告与结果包 | A12–A14基础及旧运行入口清理，依赖S1 | JSON、HTML、EvidenceIndex、CandidateBundle、重放manifest | T0/T1–T3/T5通过，零事项场景可正常结束 |
| S3 外部来源与研究 | A08–A09，可与S2并行 | 首轮四条采集/解析路径、来源健康与人工核对记录 | selected来源有真实提取证据，其余仍候选 |
| S4 多模型解释 | A10–A11及A15剩余函数清理，依赖S2 | mock故障回归、硬门禁、调用日志、小样本结果；旧模型业务层退出 | T4通过后才做T7；无真实农场外发，无三栏目兼容包袱 |
| S5 平台文件契约 | 平台snapshot/import/evidence迁移，依赖S2/S4 | 隔离测试库导出导入、待审事项、引用详情 | T8通过；原简报/任务/知识权限回归通过 |
| S6 平台后台作业 | worker/bridge/逐调用授权预算，依赖S5 | 有租约的生成作业、回执、取消与失败恢复 | 断点、撤权、重复执行测试通过 |
| S7 试点验收与运行 | 真实资料、规则和服务条件齐备 | 一农场短期回放、人员核对、私有部署、通知沙箱记录 | 各项现场依赖单独验收后才启用生产计划 |

建议第一个开发批次只做S0、S1、S2，交付“无需平台和模型密钥的农业报告演示”；第二批完成S3、S4；第三批再改梁子湖平台。每批合并前提交可运行产物、验证命令、实际日志摘要和未通过事项。

粗略工作量仅供排期：熟悉现有TypeScript代码的一名开发者，首个离线演示约4–6人日，完整独立验证再约5–8人日，平台契约与后台集成约6–10人日。资料、账号、授权、真实样本和现场验证等待时间另计；这些是估算，不能替代每阶段验收。

## 13 通知 调度 与失败恢复

独立阶段统一只生成本地产物。旧Actions模板、安装器、推送包装器和普通日报站点构建在代码清理时移除，农业产物保存在私有artifacts目录，不提供向原公开日报站点发布的入口。

集成后农场相关通知由梁子湖平台统一调度，AgriTwin不同时向同一用户另发一份，避免重复通知与两套审批状态。纯公开研发周报若以后有独立订阅，再单独设计AgriTwin通知入口。

通知幂等键至少包含installation/object范围、report或event ID、版本、channel、recipient。复用平台已有状态与回执，明确区分排队/发送中、供应商accepted、实际delivered、failed和unknown，不能将accepted当作已经送达；成功渠道不随另一渠道失败重发。外部接口超时且结果不明时先核对，不能承诺网络下绝对只发送一次。发送前复验来源有效期、最新审核和接收权限。

来源状态区分成功有数据、成功无数据、过期、失败和停用；报告明确数据覆盖。单源失败不使其余采集丢失，不能把失败映射成没有预警。任务租约失效、权限撤回或输入被替代时，保留历史运行记录，阻止新的模型调用与结果导入。

调度顺序为手工重放 → 隔离测试定时任务 → 私有试点。实时监测与告警继续由平台自身运行，批量情报和模型故障不阻塞原有告警。

## 14 目前已知问题与修复优先级

| 优先级 | 当前问题 | 处理要求 |
|---|---|---|
| P0 | AgriTwin初稿未统一执行URL/来源证据校验 | 初稿、返修、降级和出口全覆盖；农业加对象/单位/有效性校验 |
| P0 | 旧报告按科技/财经/时政最低3/3/2条约束 | 新协议允许空栏目，数量不作为农业质量依据 |
| P0 | 旧registry合并135项，模块导入触发读文件 | 删除旧定义并同步重写唯一农业registry/dispatcher；locale解耦；缺配置拒绝，消除旧源fallback |
| P0 | 平台现有简报不支持外部包导入 | 新增schema、授权snapshot、事务/幂等导入和待审状态 |
| P0 | 平台模型预算原本按另一套调用流程记录 | 每轮外发都经平台许可/预留/记账；没有桥接前仅文件测试 |
| P1 | 旧作者源把作者名单作为excerpt，论文主题固定AI四类 | 删除泛作者订阅，农业OpenAlex/arXiv实现真实摘要及农业主题；缺摘要保留未知 |
| P1 | 平台日预报已实现，自动预警适配尚待增加 | 新weatheralert适配，保留更新/取消/有效期/归因 |
| P1 | 旧通知/网页部署门禁边界不统一 | 删除旧发布器及相关配置；平台统一正式发布门 |
| P1 | 来源链接转义不等于协议安全 | 采集与渲染只接受http/https等明确允许链接，验证重定向目标 |
| P2 | 农业论文与开源效果未必适合本场 | 精选农业主题/仓库与小批量人工标注，按误收调整查询；不恢复泛科技订阅 |

首版不引入向量库、多智能体自由对话框架、全量知识图谱或独立三维平台。现有平台已有知识检索与空间功能；是否需要更复杂技术，以独立测试中的具体缺口决定。

## 15 下一步需要补齐的资料

以下资料不阻塞S0–S4的模拟开发，但会阻塞相应的真实接入验收：

| 待确认资料 | 影响 | 无资料时怎么做 |
|---|---|---|
| 首个真实塘口/地块、物种/作物和生产阶段 | 来源适用性、规则 | 使用明确模拟批次，只输出待核事项 |
| 真实对象/测点/批次ID、单位和更新周期 | 快照与映射 | 采用平台同形状fixture，不按名字猜映射 |
| 平台授权导出样例与更正/撤回记录 | 契约和引用复验 | mock或随机schema测试 |
| 已批准农艺/养殖规则及适用条件 | 操作相关候选 | 仅测试test_only规则，不出生产阈值 |
| 和风账户、接口权益与预警响应样例 | live天气接入 | 沿官方协议fixture；不宣称已联调 |
| 外部模型数据范围、预算与部署位置 | live模型和后台作业 | 公开/合成样本本地测试 |
| 审阅角色、通知对象、时区与运行窗口 | 试点发布 | 无真实发送，验收沙箱收件对象 |

本次已完成源码审阅、官方来源资料核对、135项信源待删除清单和本执行方案。V1.1按农业专用方向更新配置、代码清理与验收目标。此前运行的README信源一致性检查只证明改造前135条清单一致；当前尚未实施代码和配置删除、农业功能、平台数据库迁移、真实农场采集、模型调用、通知或部署。后续从S0记录实际执行结果，不把计划删除或通过条件标为已完成。

## 16 本对话文件索引

- [135项现有信源处置清单](../../reference/2026-10-04/%E7%8E%B0%E6%9C%89%E4%BF%A1%E6%BA%90%E5%A4%84%E7%BD%AE%E6%B8%85%E5%8D%95-2026-10-04-archive-v1.csv)。
- [农业官方来源调研](../../research/2026-10-04/agriculture-source-discovery-2026-10-04-archive-v1.md)。
- [梁子湖平台集成核对](../../research/2026-10-04/platform-integration-review-2026-10-04-archive-v1.md)。
- `research/agritwin/`：AgriTwin完整审阅快照。
- `research/liangzihu-farm-platform/`：梁子湖相关文件审阅快照，非完整克隆。
- `research/farm-review-manifest.json`：平台下载与校验清单。
- `research/download-attempts/`：早期未完成下载，保留作过程记录，不作为开发输入。
- `tools/`：本次源码下载辅助脚本；不属于任一项目的业务代码。

实施过程中继续把本对话产生的计划、测试证据和附件保存在本隔离目录；两个项目的正式修改应在各自明确的开发checkout中进行，并分别遵守其开发规则。
