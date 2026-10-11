> 文档归档副本｜原文日期：2026-10-04｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# 梁子湖平台与 AgriTwin 集成边界审阅

日期：2026-10-04。性质：源码静态审阅和后续实现建议，不是现场验收或已实现接口说明。

审阅来源为 `8jdkds7nzz-hub/liangzihu-farm-platform` 的 Git tree `9995fc20cd84093adcaa3fab954ffe9d08b9f45a`。本地镜像位于本目录的 `liangzihu-farm-platform/`，下载程序已逐文件校验所选文件。已阅读 AGENTS、README、docs/README 及下列核心实现；没有启动平台、运行迁移、连接数据库、调用模型或发送通知。平台文档所载既往验收结果不属于本次执行结果。

## 1. 集成结论

平台已有对象授权、测值质量、专业指标、知识审核、程序简报、模型解释、逐项人工审阅、任务草稿、发布范围、通知回执和后台任务。AgriTwin 的增量应是外部农业技术情报的采集、策展、适用性标注及有引用的候选解释。不要重建用户体系、设备采集、天气连接、指标计算、任务派发或通知渠道。

推荐顺序：独立合成 fixture → 严格版本化 snapshot/bundle → 本地 JSON/HTML 审阅 → 文件导入契约测试 → 平台后台生成授权 snapshot 并调用固定 CLI/JSON 协议。公网 REST 和独立只读导出 API 均是后续可选项，不是第一阶段依赖。当前不存在 AgriTwin 专用 bundle 导入接口。

## 2. 已有身份、对象与证据字段

| 对象 | 已有字段/约束 | 桥接规则 |
|---|---|---|
| Actor | `id, role, enabled, mfaVerified`；后台任务另存 `auth_version` | 平台服务端产生，bundle 不能自行声明身份或授权 |
| 业务对象 | UUID `id`，`parent_id, code, name, kind, boundary_status, source, version`；kind 为 `farm/pond/field/channel/facility` | 使用 UUID 和版本，不依赖显示名称；温室可映射现有 facility，不能假定已有 greenhouse 类型 |
| 生产批次 | `id, object_id, code, species, variety, stage, source, verified, started_at, ended_at, supersedes_id` | 应映射现有 production batch；不要凭空引入已存在的 cropCycleId，也不要从日期自行推定阶段 |
| 测值 | `observationId/pointId/object_id`、`sampled_at/reported_at/received_at`、`raw_value/value/unit/metric`、`quality/reasons/conflicted/canonical/binding_id/raw_ref/origin` | 原值、修订、冲突、历史补传及人工复测分开保留；当前值以平台绑定和质量结论为准 |
| 指标 | `id, object_id, definition_id/definition_version, value/unit/status/limitations, window_start/window_end, calculated_at, coverage, version` | 优先消费已审核定义产生的不可变结果；不得由模型补算数值并当作原指标 |
| 知识 | 文档 `id/version/object_ids/source_ref/source_url/source_checksum/body/evidence_nature/state`；chunk UUID | 新文档默认 draft，审核后才检索；不要自动把抓取材料设成 approved |
| 简报事项 | `id, briefing_id, object_id, kind, fact_refs, source_refs, original_text, limitations, decision, reviewed_text, reviewer_id, task_id, version` | 外部候选只能新增 draft；不得覆盖程序事项及审批历史 |

证据文件：`src/platform/types.ts`；`src/modules/registry/objects.ts:8`、`batches.ts:7`；`src/modules/telemetry/types.ts:2`、`queries.ts:10`；`db/migrations/016_knowledge.sql`、`017_assistant.sql`。

鉴权不是“管理员看全部”。`identity/access.ts:7-13` 的角色动作与 `grants` 中对象级动作必须同时满足；授权时刻使用服务器当前时间，不使用历史业务时间。专家还需要 `resource_grants` 的资源类型、UUID、期限及必要时间范围（`field/common.ts:8-18`）。后台在排队、执行、外发前、写回及读取结果时持续复查账号/授权；导出到文件不应使这项约束失效。

`readApi` 使用会话身份并执行专家接口约束；`writeApi` 检查 Origin、读取会话及受限 JSON，事务调用业务服务（`src/platform/api.ts:7-16`）。虽然已有 `assertIntegrationAccess()`，普通业务 API 并未因此自动接受集成 token，不能将现有会话接口当服务凭据接口直接调用。

## 3. 已确认的相关 API

以下为已有接口，具体会话、Origin、授权约束继续由平台控制；不是推荐现在调用的操作清单。

| 路径 | 方法 | 语义 |
|---|---|---|
| `/api/v1/objects` | GET / POST | 授权对象列表 / 对象保存 |
| `/api/v1/points/[id]/readings` | GET | 测点历史、当前值、质量、通信状态、缺口、人工复测；from/to、cursor、limit；最大31天、500条 |
| `/api/v1/weather` | GET / POST | 天气记录 / 有明确性质、来源及有效区间的天气录入 |
| `/api/v1/knowledge` | GET / POST / PATCH | 文档列表 / 新建待审资料 / 审核或撤回 |
| `/api/v1/knowledge/search` | GET | 权限范围内关键词/向量/混合检索 |
| `/api/v1/knowledge/chunks/[id]` | GET | 当前权限及来源有效状态复查后的引用 |
| `/api/v1/assistant` | GET / POST | 查询问答 / 排队问答，不接受任意 SQL 或控制指令 |
| `/api/v1/assistant/tools` | POST | 只允许预定义 `metrics`、`knowledge` 查询 |
| `/api/v1/assistant/policies` | POST | 对象模型外发许可、备用许可、用量上限和单价依据 |
| `/api/v1/assistant/receipts` | POST | 人工核对未知调用费用等回执 |
| `/api/v1/briefings` | GET / POST / PATCH | 简报列表 / 从平台数据库生成程序事项 / 逐项 adopted、modified、rejected |
| `/api/v1/briefings/explanations` | POST | 单独追加模型解释任务，保留原程序事项 |
| `/api/v1/briefings/tasks` | POST | 仅已采纳/修改、依据有效的事项转任务草稿 |
| `/api/v1/briefings/schedules` | GET / POST | 查看/保存平台周期日程 |
| `/api/v1/briefings/publications` | GET / POST | 查看/记录指定接收人和事项的确认范围，返回 `recorded_not_sent` |
| `/api/v1/briefings/publications/[id]` | GET / PATCH | 有期限、有接收人约束的历史审批快照 / 撤回 |
| `/api/v1/tasks` | GET / POST / PATCH | 平台任务列表、新建和状态流转 |

`POST /briefings` 只接受对象、周期、起止时间和幂等请求标识，并从已有指标/告警/天气/农事/任务等表生成事项。它没有把外部 `FarmBrief.items` 写入的实现。`POST /knowledge` 可录入来源资料，但不能代替候选 bundle、快照绑定、运行审计和外部证据生命周期。

## 4. 人工审阅、任务与通知职责

`briefings/service.ts:11-32` 建立程序事实项；缺指标、天气、农事时间窗时生成 data gap，不推断“正常”。`:34-35` 保留独立审阅历史、版本冲突检查和任务幂等。转任务须来源仍有效且 decision 为 adopted/modified；这里只生成草稿，后续派发仍属平台动作。

`:43-52` 的发布只保存接收人、角色版、审批快照和期限，不发送外部消息。接收人需要对象 read 权限；专家只获指定 briefing_item 授权，原件和其他资料另行授权。撤回发布会撤回对应资源授权。

`workers/intelligence.ts` 处理 assistant.generate、metric.calculate、briefing.generate，只有 `NOTICE_EXTERNAL_ENABLED=1` 才处理 briefing.notify。`briefings/reminders.ts` 通过平台企业微信适配器发逾期待审提醒，并处理联系人验证、资格变更、租约、费用和 unknown 回执；unknown 不盲目重发。AgriTwin 不应旁路使用旧 Feishu/PushPlus 通知脚本。

## 5. sourcesActive 的实际边界

`src/modules/analysis/evidence.ts` 有明确白名单，未知 kind 在第13行返回 false，不会自动放行。

- metric 检查结果未被同窗口新版本替代，定义已批准且未退役。
- definition、calendar 检查审批和退役；knowledge 检查文档 approved。
- record、maintenance、manual_check 检查未被 supersedes 替代。
- briefing_item 递归检查其 fact_refs/source_refs。
- alert、weather、task、batch、irrigation、inspection 等目前只检查记录存在。
- 它没有 Actor 参数，不检查调用者对象权限；它不是授权检查器。
- `sourcesActive([])` 为 true；导入候选必须另行要求非空证据。
- weather 记录存在并不代表预报仍有效，过期校验要另外做。
- `FactRef.kind` 是 string，和 `platform/types.ts` 的 `EvidenceRef` 不是同一套协议。不能将 `reading/raw/file` 类型直接当作简报已支持引用。
- 现有递归没有 visited set 或深度上限。外部可控引用进入前要防止自引、循环和过深链路。

新增 `agritwin_evidence` 时，应显式增加类型及解析器，校验 UUID、不可变来源版本、内容哈希、撤回/替代状态、适用对象、证据性质、有效期；持久记录由平台生成 ID，bundle 内源键只做导入映射。候选只有指向本次服务器授权 snapshot 的平台事实引用才可接受，不能拿一个“存在且活跃”的别处 UUID冒充本对象证据。

第一版优先复用 metric/weather/record 等平台已支持引用。若确需 observation，应新增明确规则检查对象、point binding、canonical/conflicted、质量、origin、sampledAt 和时间窗，不能伪装成 metric。资料证据与现场测量必须是不同类型。

## 6. 区域预报与现场测量

和风客户端的真实路径为 `src/adapters/qweather/client.ts`。它读 daily forecast，位置最多两位小数；返回区间、最高/最低/平均温度、日夜天气、风速、湿度和降水等，并严格检查单位。发布时间不可得时 `publishedAt:null`，不能用抓取时间填成源发布时间。

`src/modules/connections/weather.ts` 始终用 `kind:'forecast'` 导入，保存来源契约版本、网格位置确认依据、attributions、source tag、连接版本以及“外部预报不代表现场实况”“厂家未提供发布时间”限制。原响应另作加密留存。现有 API 的 weather kind 包含 actual，并不表示本次 QWeather 来源是现场 actual。

候选协议须原样保留 `kind/source/sourceVersion/stationRef/publishedAt/receivedAt/validFrom/validTo/unit/limitations`。不从区域预报推出棚内温度、水质、现场降雨或设备状态；不同站点、时段、单位、统计口径、覆盖率、物种、品种和阶段未证明可比时不作数值对比、提前天数或因果推断。过期预报可在历史资料中展示，但不得作为当前待执行建议的有效证据。

## 7. 最小桥接契约

建议先固定两个版本化文件协议；字段名为设计建议，不是现有平台接口。

**平台 → 引擎 Snapshot**：schemaVersion、snapshotId/contentHash、createdAt/expiresAt、允许的 object UUID+version、批次 UUID+version、timeWindow/timezone、平台已核验事实及引用映射、来源状态、质量与覆盖限制。账号、auth_version、资源授权和 execution lease 的可信副本留在平台运行表，不能相信引擎回传值；外部模型上下文使用 O1/O2 别名及脱敏文本。

**引擎 → 平台 CandidateBundle**：schemaVersion、bundleId、snapshotId+hash、engine/prompt/policy version、generatedAt、外部来源及版本/内容哈希/发布时间/获取时间/有效期/适用性/证据性质；候选 candidateKey、对象映射、非空引用、解释文本、限制、待核事项，以及完整调用用量记录。外部来源状态默认 pending。严格拒绝未知字段及 SQL/actions/decision/reviewer/taskId/publication/notification 等执行或审批字段。

导入必须先 dry-validate 全包，再在单一事务内：复查导入者权限和原授权快照；锁幂等键；检查同 bundleId 同 hash 返回同结果、不同 hash 冲突；持久化不可变 bundle 和证据；映射引用；新增 `kind:'external_intelligence'` 等候选 draft 事项。追加到已 reviewed 简报时回到 pending_review，保持旧审批/发布快照不变。导入不能自动认可来源、采纳事项、派单或通知。迟到结果、过期 snapshot 或来源撤回应拒收并留下可审计原因。

固定 CLI 使用绝对已批准程序路径、参数数组、shell:false、stdin JSON 和有大小上限的 stdout JSON；日志到 stderr。不得从 bundle 指定可执行路径、任意文件路径、命令参数、URL 回调或数据库连接。首轮文件测试不需要任何平台凭据。

## 8. 多模型预算与执行租约不能直接沿用两次调用假设

现有 `model_reservations.run_id`、`model_attempts.run_id`、`model_receipts.run_id` 外键均指向 assistant_runs（017:14、025:8/19）；reserved_calls 默认2，`assistant/service.ts:28-30` 按两次调用预留。现有路径为一个主模型调用，明确 HTTP 拒绝时才尝试后备。它不是多 worker/editor/reviewer 的通用账本。

后续集成必须采用独立 AgriTwin run/attempt ledger，或经单独迁移抽取共享 execution ledger。第一版宜独立新增桥接运行账本，避免改写既有助手账单；但预算统计和对象级锁必须聚合助手与 AgriTwin 的预留和实际费用，不能形成两个可各自花满同一额度的预算池。

执行前持久化 runId、actor/auth_version、授权对象/资源快照、snapshot hash、executionToken/lease、最大调用数/token/费用/总时长、计划角色及价格快照。每个实际 attempt 另记角色、模型固定版本、父步骤、输入哈希、权限/预算核对、started/completed、provider request ID、usage 和 known/unknown 状态。

模型调用边界必须由平台授权的执行器管理。不能仅由父 worker 启动一个持全部 API keys 的 AgriTwin CLI 后，等最终 JSON 再一次性记账；这无法在每次调用前复查撤权、来源变化和预算，也无法可靠记录崩溃后的已收费调用。可采用固定 CLI 的受限 request/response 桥，由平台执行器逐次确认并执行模型请求；引擎只组织确定性步骤与提示上下文，不直接获得生产数据库及模型凭据。

每次调用前复查租约、授权、来源、全局开关、对象策略、跨月和预算，持久记下 external_started/attempt 后才调用。模型超时、进程退出或失去租约后的迟到答案不能写回；结果未知应持有保守预留、等待回执核对，不能当失败无成本立即重试。用量未知不按零计费；成本依据使用调用当时的价格快照。

离线阶段用固定 provider fixture 和本地 ledger 演练这些状态，不启用真实模型、不连接真实预算表。引擎断电/失败始终不阻塞平台实时告警、程序指标和原简报生成。

## 9. 未来平台端文件级变更建议

以下是分阶段候选清单；现在不创建这些业务模块，不预占迁移编号（当前 tree 已到043）。

| 文件/区域 | 计划变更 |
|---|---|
| 新 `src/modules/intelligence-bridge/contracts.ts` | Snapshot/Bundle 严格版本协议、限长、枚举、引用结构、适用性与脱敏边界 |
| 新 `.../snapshot.ts` | 从现有业务服务构造授权/时点固定的 snapshot，不直接以任意SQL导出 |
| 新 `.../import.ts`、`.../evidence.ts` | 文件 dry-validate、幂等事务、引用映射、来源版本/撤回和候选草稿 |
| 新 `.../runtime.ts`、`.../ledger.ts` | 固定CLI桥、受控模型调用、执行租约、逐次预算/权限复查、unknown状态及回执 |
| 新 `db/migrations/<next>_intelligence_bridge.sql` | run、snapshot、bundle、外部证据、候选映射、attempt/reservation/receipt；不可变来源、幂等键、外键和审计 |
| `src/modules/analysis/evidence.ts` | 显式新 evidence kind、类型白名单、递归防环；可提取授权与有效期检查辅助函数 |
| `src/modules/briefings/service.ts` | 受控追加draft候选、恢复pending_review、来源时效复核；保持原事实项/审批/转任务状态机 |
| `src/modules/knowledge/service.ts` | 如需复用资料入库，只调用已有createDocument生成draft；加强来源映射，绝不自动reviewDocument |
| `src/modules/assistant/service.ts` 与预算聚合模块 | 仅当启用真实多模型运行时适配共享总额统计；保留原助手行为及历史账单 |
| `src/modules/jobs/repository.ts`/执行辅助及 `workers/intelligence.ts` | 注册独立job kind、租约和恢复规则；先显式触发，不自动接入现有所有日程 |
| `src/app/(platform)/briefings/panel.tsx` | 分开展示程序事实与外部候选、来源和限制、过期/撤回状态，复用人工审阅入口 |
| 可选导入路由或本地管理员命令 | 先文件导入；若新增上传路由，继续会话/Origin/大小/对象授权检查；不默认新增公网API |
| README、CHANGELOG、docs/README及契约/验收文档 | 同步真实实施状态、命令、迁移和测试证据；遵守平台AGENTS的逐次变更日志要求 |

## 10. 必须具备的契约测试

1. **协议**：有效 fixture、未知版本/字段、过大输入、空证据、重复键、非UUID、非法URL协议、执行/审批字段注入；相同bundle重试无重复，变更hash返回冲突。
2. **权限**：有对象权限才导出/导入；admin无grant不能读业务；专家仅特定resource；跨对象UUID、账号变化、排队后撤权、过期授权均拒绝；CLI回传Actor不影响授权。
3. **来源**：未知kind拒绝、假UUID拒绝、已撤知识/退役定义/重算指标拒绝；weather存在但过期不能生成当前操作事项；来源在执行中撤回，迟到bundle不能采纳；递归自引/循环/过深失败。
4. **测值与天气**：现场actual与forecast不能互换；publishedAt为空保留未知；单位不符、未来采样、失效binding、冲突数据、历史补传、manual与online分列；缺数据不转正常。
5. **生命周期**：只追加draft；原程序事项及历史审批不可覆盖；追加后重回pending_review；未审/驳回/过期候选不能转任务；采纳后仅任务草稿且幂等；未派发不表示执行。
6. **并发与恢复**：重复导入、同键不同内容、并发审阅版本冲突、事务回滚、旧lease/迟到stdout、截断JSON/进程失败均不留下半包；原程序简报与告警继续工作。
7. **多模型预算**：实际最大attempts含worker/editor/reviewer/返修/后备；每次预留不足停止；助手与AgriTwin并发总额不超限；撤销后备许可、跨月、价格变更、unknown usage、未知回执不重复扣账/不按零结算。
8. **外发与通知**：离线模式全部真实provider不调用；未许可对象不进入外部上下文；精确坐标、身份、私有URL脱敏；导入不发送任何通知，后续提醒由平台原回执链路接管。

建议扩展已有 `tests/integration/intelligence-runtime.test.ts`、`briefing-authority.test.ts`、`tests/unit/intelligence.test.ts`、`qweather.test.ts`，另新增 bridge contract/unit/integration 测试。数据库集成测试只用 `agri_test` 随机 schema，不能复用生产或外层日报数据库；本次未运行上述测试。
