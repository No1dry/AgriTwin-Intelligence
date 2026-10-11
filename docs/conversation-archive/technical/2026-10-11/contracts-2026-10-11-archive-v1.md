> 文档归档副本｜原文日期：原始日期未单独确认；本目录日期为快照日期｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# 农业数据契约 v1

本文描述已经实现的 TypeScript 类型、Zod 校验和本地产物。事实来源是 types.ts（原本地引用：`../lib/agriculture/types.ts`；目标未随本次文档归档上传）、schema.ts（原本地引用：`../lib/agriculture/schema.ts`；目标未随本次文档归档上传） 和 validation.ts（原本地引用：`../lib/agriculture/validation.ts`；目标未随本次文档归档上传）。默认 `offline` 模式使用合成现场及合成证据；第 9 步增加 `source-test`，把独立采集的公开资料与合成农场快照结合。公开资料采集需要显式联网，封存后的报告生成与重放校验使用本地缓存。

两种模式都没有接入梁子湖平台、真实传感器、真实天气账号或设备，也不写入平台简报、知识库和任务。真实资料不能把模拟现场变成真实现场。本文是数据契约说明，不是平台集成 API 的部署说明。

## 1. 快照身份、范围和时间

`FarmSnapshot` 的 `schemaVersion` 固定为 `1`。`installationId` 标识一个安装实例；`snapshotId` 标识一次输入快照；对象、批次、观测、天气记录和任务使用 UUID。快照没有嵌入自身的 hash，外层报告、候选包和运行清单绑定 `hashValue(snapshot)`。

| 字段组 | 实际含义 |
|---|---|
| `capturedAt`、`timezone`、`window` | 快照截取时间、IANA 时区、观测统计窗口 `{from,to}`。窗口采用 **`[from,to)`**；结束时刻上的观测不属于本期。 |
| `authorizedObjectIds`、`objects` | 授权对象集合与快照对象完全对应，不接受缺失、额外或重复的对象 ID。此字段是输入契约；未来平台导出端仍须依据当前用户权限生成范围，不能把客户端提交的集合当作授权结果。 |
| `batches`、`observations` | 带对象归属的生产批次与测量。一个观测的 `batchId` 若非空，必须属于同一对象。 |
| `weather` | `{status,daily,events}`，分别记录取数状态、日预报和预警事件。 |
| `tasks`、`limitations`、`synthetic` | 已有任务快照、必须保留的数据限制、数据是否合成。合成快照不能混入标记为真实的观测、天气或任务。 |

`objects.kind` 支持 `farm/pond/field/channel/facility`；`productionSystem` 支持 `mixed/aquaculture/crop`。本版要求恰好一个根农场、根的 `parentId=null`，其他对象直接引用该农场，因此不允许父对象循环。本版尚不表示支持平台全部多层对象结构；将来遇到更深层级需要明确扩展协议，不能偷偷丢弃父子关系。

所有时间戳必须是具有时区偏移的合法 ISO 时间，统一由 runtime/config.ts（原本地引用：`../lib/runtime/config.ts`；目标未随本次文档归档上传） 的 `parseClock()` 验证运行时钟；非法日历日期（如 2026-02-30）被拒绝。UTC 规范化用于比较，不替代 `timezone` 的本地日期显示语义。任务更新时间、观测入库时间和天气接收/获取时间不能晚于 `capturedAt`。预报覆盖未来时间是合法的，不能因此将预报当成未来实测。

## 2. 观测时间别名和可信当前值

| 农业 v1 字段 | 语义与校验 |
|---|---|
| `observedAt` | 对应平台 `sampledAt` / 数据库 `sampled_at`，即实际采样时间。 |
| `reportedAt` | 设备或来源的报告时间，可为 `null`；不能用它替代未知的采样时间。 |
| `ingestedAt` | 对应平台 `receivedAt` / `received_at`，即系统收到数据的时间。 |
| `pointId`、`bindingId` | 测点和当时的对象绑定；同一绑定不能指向不同对象或测点。 |
| `origin` | `live/history/manual`，实时、历史回补与人工测量保持区分。 |
| `canonical`、`conflicted` | 是否为主记录、是否存在冲突。两者均显式传入，不从数值大小推测。 |
| `quality`、`value` | `good/suspect/missing/invalid`；缺测必须是 `value:null`。未知值不补成零。 |

时间顺序为 `observedAt ≤ reportedAt ≤ ingestedAt`，`reportedAt=null` 时只验证采样与入库顺序。平台可能保存采样时间未知的原始记录；本版不能把这种记录强行映射成合法 `Observation`，导出适配器应保留原记录并给出缺口，或在后续协议中扩展隔离记录结构。

当前支持的指标和单位是：水温与气温 `degC`、溶解氧 `mg/L`、水位 `m`、土壤含水率 `%`。单位必须与指标匹配；土壤含水率使用 0–100 表示法。地块不能接收塘口指标，塘口不能接收土壤含水率。合法数值范围检查不是农艺安全阈值；本版不会由测值推出“正常”“安全”或设备操作量。

context.ts（原本地引用：`../lib/agriculture/context.ts`；目标未随本次文档归档上传） 的 `currentObservations()` 只选取 `origin=live`、`canonical=true`、无冲突、质量良好且新鲜的观测。选择最新采样后再检查质量，避免新记录失效时悄悄恢复旧的良好记录。相同对象、测点、指标与采样时刻出现不同值时，相应记录不参与当前状态判断。历史回补、人工复测、天气气温及预报均不能补齐塘口当前水温或溶解氧。

当前默认 2 小时新鲜度仅服务于逐小时合成样例，是数据传输时效规则，不是农艺阈值。平台接入时必须适配其测点 `maxAgeMs`、绑定有效期和 `dataState`，不能把所有设备强制套入此默认值。

## 3. 批次与证据适用性

`ProductionBatch` 保存 `objectId/species/variety/stage/status/verified/startedAt/endedAt/supersedesId`。已结束批次必须有结束时间，活动批次不能带结束时间；更正关系必须指向同一对象且开始时间更早的批次，防止循环。

quality.ts（原本地引用：`../lib/agriculture/quality.ts`；目标未随本次文档归档上传） 检查活动批次是否唯一、已经开始且完成确认，以及批次物种/阶段是否与对象标签冲突。evidence.ts（原本地引用：`../lib/agriculture/evidence.ts`；目标未随本次文档归档上传） 在塘口和地块上要求唯一、已开始且 `verified=true` 的活动批次，并以批次中的物种和阶段判断证据适用性。缺少确认批次时返回 `unknown`；不会使用对象上的旧标签代替确认。

`EvidenceRecord` 包含：

- 来源与追溯：`id/kind/title/source/rawReference/content/contentHash/version`。`source` 保存来源 ID、名称、URL、发布时间和获取时间；发布时间可为 `null`，不能捏造为采集时间。
- 范围：`applicability` 中的地区、对象类型、物种、阶段、生产系统。
- 有效性：`validFrom/validUntil/reviewState/usageRights/limitations/synthetic`。`validUntil=null` 只表示没有明示结束时间，不证明内容永远正确；真实接入还需版本替代和撤回策略。

applicability.ts（原本地引用：`../lib/agriculture/applicability.ts`；目标未随本次文档归档上传） 返回 `state`、兼容布尔值 `applicable`、已知不匹配的 `reasons` 和未知条件 `missing`。状态为 `applicable/not_applicable/unknown`。地区或物种不匹配、证据未生效或过期不能放行；缺少范围、发布时间或审核信息时不能把未知当匹配。空范围数组不是全域适用；字符串范围显式使用 `*` 才表示通配，仍需按当前实现检查本地上下文是否完整。

目前合成资料的 `reviewState=reviewed` 只是测试输入设定，不代表任何农艺人员审核了真实技术建议。研发论文不能自动升级为已审核的生产规则。

### 公开资料的兼容扩展

external-evidence.ts（原本地引用：`../lib/agriculture/external-evidence.ts`；目标未随本次文档归档上传） 的 `toExternalEvidence()` 接收 official-agriculture.ts（原本地引用：`../lib/sources/official-agriculture.ts`；目标未随本次文档归档上传） 的 `OfficialArticle`，形成 `synthetic=false`、`reviewState=unreviewed`、`kind=reference` 的证据。采集成功只说明取得并提取了一份页面，不能写成“已完成农艺审核”。本阶段不接受把采集资料直接改成 `reviewed`。

| 扩展字段 | 已实现的含义 |
|---|---|
| `source.publishedDate`、`source.datePrecision` | 日期为 `YYYY-MM-DD` 或 `null`；精度为 `datetime/date/unknown`。仅日期或不带明确时区的页面钟点保留日期，`publishedAt=null`，不补造午夜或时区。未知日期两个发布字段均为 `null`。 |
| `source.originalPublisher` | 页面明确注明的原发布者；未知时为 `null`，不拿网站托管机构代替。`source.name` 仍记录当前登记来源。 |
| `collectionRunRef`、`rawReference` | 仓库相对路径，分别指向本次采集 `collection.json` 和封存的响应文本缓存。它们是本地追溯引用，不是已经上传的平台资源 ID。 |
| `content`、`contentHash`、`fullTextHash` | `content` 为从提取正文取得、合并空白后的短节选，最多 **180 个 Unicode 字符**，不使用未经核对的生成式摘要冒充原文。`contentHash` 绑定该短节选；`fullTextHash` 绑定完整的已提取正文文本，不代表附件或图片内容。 |
| `extraction.status/dateSource/timeRaw` | 提取状态 `complete/partial`、页面日期来源标记、可选原始日期文本。`complete` 只描述当前文本提取路径，不是材料完整性或专业正确性的认证。 |
| `extraction.attachments` | 附件 URL、标题与 `identified_not_parsed` 状态。当前只识别链接，不下载、解析或推断附件内容；存在附件必须保留“未解析”限制。 |

外部证据要求上述采集及日期精度元数据，旧合成 v1 证据可省略这些新增字段。非法日历日期被拒绝；已知发布日期必须保留其提取来源。正文不完整、附件未解析和发布日期未知分别留下限制说明。

适配器不会从机构名、标题或地址推断物种、生产阶段和本场范围；当前外部证据的五组 `applicability` 数组保持为空，适用性为 `unknown`。`validFrom` 使用本次资料记录的获取时刻，`validUntil=null`，仅表示记录可供核对，不是农业措施的生效期，也不是“今日预警”的有效期。历史材料按背景资料呈现；新的抓取日期不会刷新旧文章的发布日期。

## 4. 天气日预报与事件生命周期

`weather.status` 有三种值：`success` 表示成功取得记录，`empty` 表示成功取得空结果且数组必须为空，`failed` 表示取数失败。失败会产生质量缺口，保留已有事件，不能解释为“没有预警”或“预警已解除”。普通无预警场景也可能为 `success`，因为仍有日预报记录。

`WeatherDaily` 保存对象归属、预报时段、获取时间、最高/最低温、降水量和 `attributions`。本版预报是独立上下文，没有通向实测值补全的路径。

`WeatherEvent` 保存本地 UUID、`sourceId/eventKey/version`、`messageType`、`supersedes`、对象范围、地区、发布/接收/生效/失效时间和等级。events.ts（原本地引用：`../lib/agriculture/events.ts`；目标未随本次文档归档上传） 按 **`sourceId + eventKey`** 归并，按事件版本决定状态，不按消息到达顺序决定状态。替代关系必须属于同一来源和事件；跨来源覆盖、版本冲突或找不到被替代记录时保留诊断并隔离该组事件。

取消消息是持续有效的取消记录：取消消息自己的展示有效期结束后，不恢复它已经替代的旧预警。旧版本晚到或重复到达也不能覆盖新版本。日预报和预警有独立协议；已核对的农场平台和风客户端只实现 weather v1 日预报、Ed25519 JWT 和来源归因，weatheralert v1 接入仍属于后续工作。

未来真实和风事件的外部 ID 并非天然符合本地 UUID/整数版本协议；适配器需要保留外部标识和原始记录引用，建立稳定的来源命名空间与替代映射。不能伪称供应商直接返回本版 `eventKey/version`。

## 5. 简报、候选包与引用

`BriefItem` 将展示文本与依据绑定：`id/stableKey/kind/title/summary/severity/objectRefs/factRefs/evidenceRefs/requiredLimitations/nextAction/validUntil/applicability`。`objectRefs` 是当前安装实例内对象的原 UUID；`factRefs` 指向导出快照中的事实 ID，`evidenceRefs` 指向同一批证据。`stableKey` 用于同一事项跨生成版本定位，不表示平台已完成幂等导入。

`FarmBrief` 保存身份、快照 hash、时间窗口、质量、覆盖情况、证据索引和配置 hash。状态只有 **`needs_review` 或 `blocked`**，没有 `approved`。`coverage` 记录对象 ID、输入观测数、证据数和有效天气事件数；输入观测总数不等于当前可信观测数量。

`CandidateBundle` 的 `contractVersion` 是 `agritwin-candidate-v1`。它保存 `producerVersion/bundleId/installationId/snapshotId/snapshotHash/authorizedObjectIds/runManifestHash/generatedAt/validUntil`，以及事项、证据、质量和限制。候选包没有自行执行任务或调用设备的权限。它通过引用绑定 `snapshot.json`，因此校验时需要同一次运行的完整产物，而非只取一个孤立候选 JSON。

validation.ts（原本地引用：`../lib/agriculture/validation.ts`；目标未随本次文档归档上传） 会复核首稿及每次 mock 返修的事实、引用、限制、覆盖和有效期；当前 mock 输出必须与确定性草稿一致，不允许自由改写数值或操作内容。发布为离线文件前再次校验快照绑定、证据正文 hash 和对象归属。提及失效证据的 `verification` 条目仅说明数据缺口，不把该证据作为现场建议依据。

`FarmBrief`、`CandidateBundle` 和 `RunManifest.core` 增加两个**可选且无默认值**的字段，保留旧 v1 产物缺省字段的含义与 hash：

- `inputProvenance: {farm:'synthetic', evidence:'synthetic'|'external'|'mixed'}`。`synthetic=true` 仍表示报告包含模拟现场，不能解释成整份报告全部合成。存在外部证据时必须显式标注来源；零篇的真实采集运行仍标为 `evidence:'external'`，结合覆盖数和来源诊断表达“没有取得资料”。契约能表示 `mixed`，本阶段的公开资料测试入口要求证据全部来自外部采集，不混入模拟参考资料补数。
- `sourceCollection: {runRef, statuses:[{id,status,detail}]}`。`runRef` 形如 `artifacts/source-collections/<run-id>/collection.json`；来源状态为 `success/partial/empty/blocked/failed`。报告、候选包与运行清单中的两个新增字段必须一致。

`RunManifest.core.mode` 为 `offline` 或 `source-test`。后者必须带上述来源信息并使用 `modelMode=deterministic`，不调用真实模型或 mock 模型。来源状态还必须出现在运行清单的 `sourceStatuses` 中。标题分别为“农业情报 · 离线测试报告”和“农业情报 · 真实资料独立测试报告”。

公开资料逐篇显示为“资料候选”，其 `kind=verification`、`severity=info`、`applicability=unknown`，保留证据 ID、日期、短节选和全部资料限制。它们不生成现场实时风险 `attention`；即使存在合成天气预警，没有已审核且适用的真实依据时也只能待核实，模拟参考资料不能在 `source-test` 中补足这一条件。

来源取数失败、受阻、部分成功和明确空结果各自形成待核实事项。`success` 必须对应至少一篇进入索引的资料；`empty/blocked/failed` 不能携带该来源的文章。零篇时另列“本次未取得可用公开资料”，不声称无风险，也不自动把 `failed` 改成 `empty`。`quality` 的快照评估与来源采集状态分别保留，不能只看农场快照 `quality=ok` 就认为外部来源正常。

## 6. Hash 和文件清单

hash 实现统一见 runtime/hash.ts（原本地引用：`../lib/runtime/hash.ts`；目标未随本次文档归档上传）。

| 用途 | 算法语义 |
|---|---|
| `EvidenceRecord.contentHash` | `hashText(content)`：证据字段 `content` 的 UTF-8 文本 SHA-256，计算 hash 时不再裁剪或 JSON 编码。外部证据的 `content` 已是最多 180 字符的节选，不是完整网页。 |
| `OfficialArticle.contentHash` / `EvidenceRecord.fullTextHash` | 完整的已提取正文 `contentText` 的 `hashText()`。提取已去除脚本等非正文、处理段落和空白；不是响应 HTML 或附件的 hash。 |
| 请求记录 `responseHash` / 缓存 `raw/<hash>.txt` | HTTP 响应按记录的字符集解码后，完整响应文本的 `hashText()`。缓存以 UTF-8 保存这个解码结果，重放可重新计算核对。 |
| 请求记录 `rawBytesHash` | 网络响应字节在解码前的 SHA-256，另留字节数和字符集。当前归档保存解码文本，不保存原始字节；因此这个字段是采集时的摘要记录，不能从现有缓存独立重算验证，尤其不能与非 UTF-8 响应的 `responseHash` 混用。 |
| `snapshotHash`、配置 hash、证据集合 hash、`runManifestHash` | `hashValue(value)`：对象键排序的规范 JSON 再做 SHA-256；数组顺序保留。普通 JSON 缩进变化不改变这个语义 hash。 |
| `RunManifest.outputs[filename]` | 已写出文件完整 UTF-8 文本的 SHA-256，包含缩进和结尾换行；文件格式变化会改变这个 hash。 |

`RunManifest` 的外层是 `{schemaVersion,runId,status:'complete',core,outputs}`。`core` 保存代码版本/代码 hash、配置 hash、输入 hash、协议版本、来源状态、模型尝试、预算和错误；候选包的 `runManifestHash=hashValue(core)`。清单外层随后记录其他文件 hash，避免“清单含候选 hash、候选又含完整清单 hash”的循环。

store/filesystem.ts（原本地引用：`../lib/agriculture/store/filesystem.ts`；目标未随本次文档归档上传） 写出 `snapshot.json`、`evidence-index.json`、`report.json`、`report.html`、`candidate-bundle.json`，最后写 `run-manifest.json`，再将暂存目录整体提交为运行目录。清单不能只写一个成功标记而缺少实际输出；已有运行目录不覆盖。完整性 hash 能发现内容不一致，不等于数字签名或可信发布者认证。

### 采集归档与本地重放

sources/archive.ts（原本地引用：`../lib/sources/archive.ts`；目标未随本次文档归档上传） 在独立的 `artifacts/source-collections/<run-id>/` 中保存：

- `collection.json`：采集起止时间、采集器版本、当时的完整来源目录及其 hash、逐来源结果、请求记录、筛除记录、诊断和完整提取文章。
- `raw/<decoded-response-hash>.txt`：按内容寻址的解码响应文本。文件扩展名为 `.txt`，不作为可执行网页打开；URL 不直接用作文件系统路径。
- `manifest.json`：采集文件清单和各文件 UTF-8 文本 hash。已有采集目录不能覆盖，采用暂存目录完成封存。

`readCollectionArchive()` 限定到本项目的采集目录，检查文件清单、路径、符号链接、大小与 hash。它使用**归档中的来源目录**重新执行 `parseOfficialArticle()`，将解析出的文章与存储文章完整比较，核对原文缓存和成功详情请求。这个重放不发送网络请求，也不证明来源页面今天仍然相同。

报告文件自身的结构与 hash 验证不等于原采集缓存验证。agriculture-validate.ts（原本地引用：`../scripts/agriculture-validate.ts`；目标未随本次文档归档上传） 对带 `sourceCollection` 的报告进一步读取封存采集目录，将重放文章重新通过 `toExternalEvidence()` 转换，与报告证据整体比较，并核对来源状态。只有报告文件、没有相应采集归档时，不能声称已经完成这项外部资料重放校验。整个流程仍是本地完整性与内部一致性校验，不是发布者数字签名、专业审查或平台导入验收。

## 7. 与梁子湖平台的未来字段映射

下表依据已读取的平台源码制定，是**待实现的适配设计**。现有 AgriTwin 没有读取这些平台接口，也没有候选导入端点。正式接入前需对固定的平台版本做契约测试。

| 平台已有字段或能力 | 农业 v1 映射与待处理事项 |
|---|---|
| `objects.id/parent_id/name/kind`，对象权限检查 | 原 UUID 映射 `FarmObject.id/parentId/name/kind`；授权范围必须由平台服务端决定。地区、生产系统和安装实例 ID 需由明确配置/数据来源提供，不能根据显示名称推断。多层结构与本版直接子对象限制需显式处理。 |
| `production_batches` 的 species、variety、stage、verified、started_at、ended_at、supersedes_id | 映射同义批次字段；`status` 由批次时段及更正关系在快照时钟下推导，不能随意生成。 |
| 观测 `sampled_at/reported_at/received_at/object_id/point_id/binding_id/origin/canonical/conflicted` | 对应 `observedAt/reportedAt/ingestedAt/objectId/pointId/bindingId/origin/canonical/conflicted`。平台 `quality=valid` 需明确映射为 `good`，`suspect/invalid` 保持含义；`missing` 是本版缺测表达，不能伪造为平台已有测值。 |
| 测点 `maxAgeMs/maxGapMs`、查询 `dataState`、原始 `raw_ref` 与映射版本 | 生产适配需保留其来源、缺口与绑定时效。当前简化 Observation 没有完整 raw/mappingVersion 子结构，需新增导出元数据或升级协议，不能声称这些信息已完整保留。 |
| 和风客户端 `readDaily()` 的 days、数量单位与 attributions | 转成 `weather.daily`，保留来源声明；平台温度单位 `°C` 到本地 `degC` 需显式映射并留来源版本。当前只是类型对应，尚无桥接代码。 |
| 平台 weather records 的 actual/forecast/warning/baseline | 按性质分离；不能把 actual 或 baseline 全部塞入 daily forecast，也不能将人工 warning 记录声称为自动 weatheralert 同步。 |
| `knowledge_documents` / chunks 的正文、版本、来源、对象范围、审核/撤回状态 | 可在未来适配为 EvidenceRecord，但必须保持平台审核权限和撤回规则；平台正文 checksum 与本版 raw-text hash 算法可能不同，应各自保留并验证，不能直接改名冒充同一 hash。 |
| `briefing_items.fact_refs/source_refs/original_text/limitations` | 候选 `factRefs/evidenceRefs/summary/requiredLimitations` 需要转为平台带 `kind,id` 的引用；多对象事项如何拆分或关联、stableKey 如何防重复导入都待服务端明确实现。 |
| 简报逐项审阅、`toTaskDraft()`、任务状态机 | 继续由平台处理采纳/修改/驳回和后续任务；AgriTwin 的 `needs_review` 不能映射为已审阅，`nextAction` 也不能自动变成已派单。简化任务状态与平台详细状态之间需显式映射。 |

平台源码核对位置：`src/modules/registry/{objects,batches}.ts`、`src/modules/telemetry/{types,queries}.ts`、`src/adapters/qweather/client.ts`、`src/modules/weather/service.ts`、`src/modules/knowledge/service.ts`、`src/modules/briefings/service.ts`。这些是配套平台的路径，不是本仓库已实现的模块。

## 8. 离线边界验证

domain.test.ts（原本地引用：`../tests/agriculture/domain.test.ts`；目标未随本次文档归档上传） 验证八种合成场景、非法日历日期、半开时间窗、授权和引用、单位、批次确认、历史/冲突数据排除、天气取数失败、跨来源预警冲突与乱序取消。fixtures/agriculture/README.md（原本地引用：`../fixtures/agriculture/README.md`；目标未随本次文档归档上传） 说明模拟样本生成方式。

external-evidence.test.ts（原本地引用：`../tests/agriculture/external-evidence.test.ts`；目标未随本次文档归档上传） 使用显式测试页面数据验证日期精度、双 hash、附件限制、来源标识、零篇失败诊断及候选边界；这些单元测试本身不进行真实采集。默认 `offline` 的旧报告继续通过相同规则和校验，不因新增可选字段改变其缺省数据结构。

每个正常场景包含一农场、两塘口、一地块和 1008 条逐小时观测；冲突场景增加一条矛盾记录。数据完全合成，证据 `rawReference` 使用 `fixture://` 命名空间。这些测试证明离线协议和程序边界，不证明传感器接通、农艺模型校准、外部来源稳定、专业审批完成或平台生产集成已通过验收。

合成标识符不是平台真实 ID。对象、测点、绑定和批次使用固定的虚构 UUID；观测 ID 包含实际采样时刻，并与天气版本、天气事件键、日预报、任务和证据一起按 `scenario + UTC clock` 区分生成轮次。同场景同一时刻重复生成完全一致，不同时区写法指向同一时刻也一致；更换场景或时钟不会用同一动态记录 ID 冒充另一条合成记录。这是独立测试样本的身份规则，不是生产平台的跨窗口观测去重协议；实际接入必须保留平台原始记录身份与版本。

## 9. Kimi 解释评估产物（独立协议）

第 10 步新增 `agritwin-model-evaluation-v1`，实现见 model-evaluation.ts（原本地引用：`../lib/agriculture/model-evaluation.ts`；目标未随本次文档归档上传）。输入包含模拟事实、明确的缺口和带身份的资料片段；模型输出严格限定为 `decision/explanation/citations/factRefs/missingFields/limitations`。测试答案不发送给模型。引用须命中指定片段中的连续原文；引用数值只通过逐字短引文展示，自由解释不承载数值、单位或 URL。

程序外层固定 `reviewState=unreviewed`、`humanReview=pending`、`farmSynthetic=true`、`applicability=unknown`、`allowOperationalUse=false`、`semanticVerification=not_performed`。自动通过仍需核对语义；模型不能自行设置审核或操作权限。缺口、虚构引用、额外权限字段等会被拒绝。

该产物保存在 `artifacts/model-evaluations/`，与 `DailyReport` 和 `CandidateBundle` 分离。既有确定性报告要求输出与批准草案一致的校验保持原样；Kimi 自由解释不能绕过它，也不自动成为平台简报或任务。预检、注入单元测试与真实官方 API 执行分别记录，不互相冒充。

模型报告校验会核对产物、响应、输入和引用的绑定，并重建默认样本或重放原采集目录。hash 仍用于完整性检查，不是服务商或发布者的数字签名。具体调用限制、凭据位置和失败处理见 [Kimi 测试指南](kimi-testing-2026-10-11-archive-v1.md)。
