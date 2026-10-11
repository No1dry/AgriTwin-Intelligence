> 文档归档副本｜原文日期：原始日期未单独确认；本目录日期为快照日期｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# 农业来源目录与第 9 步独立采集

唯一来源目录为 `config/sources.agriculture.json`（原本地引用：`../config/sources.agriculture.json`；目标未随本次文档归档上传），农业配置为 `config/agriculture-profile.json`（原本地引用：`../config/agriculture-profile.json`；目标未随本次文档归档上传）。旧的 135 条通用科技、财经、时政来源定义已删除，没有旧源自动回退。

第 9 步只为两个公开农业站点实现有请求上限的真实采集，以及从封存记录生成报告的独立流程。农场对象、批次、观测、天气与任务仍来自合成快照；没有接入真实现场、天气账号、梁子湖平台、付费模型或设备。原有 fixture 演示和测试继续默认离线。

## 来源范围与验证状态

| sourceId | 本阶段用途与边界 |
|---|---|
| `hubei-fisheries-extension` | 湖北农业事业发展中心站点 `hbnysy.hubei.gov.cn` 中的水产技术资料；使用专用列表和正文解析器，保留原发布机构与附件缺口 |
| `ezhou-agriculture` | 鄂州市农业农村局站点 `nyj.ezhou.gov.cn` 中的种植、水产、防灾等技术资料；区分转载出处、技术内容与行政宣传 |
| `hubei-agriculture` | 待接入；湖北农业技术、作物农时与防灾资料 |
| `qweather-weather-alerts` | 待接入；需账号、专用 API Host、坐标与预警适配，目录链接是文档入口 |
| `nmc-agrometeorology` | 待接入；农业气象、图文解析与区域空间尺度 |
| `natesc-crop-guidance` | 待接入；种植农技、病虫趋势、墒情与访问稳定性 |
| `moa-fisheries-guidance` | 待接入；水产指导、文档附件与替代关系 |
| `hzau-fisheries-research` | 待接入；从学校报道追溯论文与试验条件 |
| `fao-integrated-aquaculture` | 待接入；复合种养背景资料、年份、地区与逐项许可 |
| `arxiv-agriculture` | 待接入；农业定向论文发现、真实摘要与预印本标记 |
| `openalex-agriculture` | 待接入；农业论文与 DOI 元数据、真实摘要及跨源去重 |
| `github-agriculture-tools` | 待接入；农业工具、数据、模型与分别核验的许可 |

后十个来源组仍是登记项，不因两个站点通过测试而变成已接通来源。研究来源的查询必须明确包含农业或水产语义，论文与项目只能作为 `research_lead`，不能直接成为操作依据。

两个站点的 `fetch_verified` / `available` 状态必须以实际抓取与重放验收为依据，并记录 `lastVerifiedAt`；当前值以目录和对应采集档案为准。该状态只表明在记载时刻完成了有限样本验证，不承诺生产稳定、栏目长期不变、全文提取完整、资料专业审核完成或允许全文转载。单次 `empty`、请求失败或只有解析 fixture 通过，均不足以宣称成功取得技术资料。

## 三条分开的运行路径

1. **离线 fixture**：`agriculture:demo` 使用合成现场与合成证据；`collectSource()` 默认 `offline`，不会因为目录项已验证或传入 transport 而自动联网。RSS/HTML fixture 解析返回 `fixture_parsed`，不提升真实来源状态。`example.invalid` 是合成引用占位，不应请求。
2. **公开站点采集**：`agriculture:collect --mode live` 才启动真实网络读取；只支持上述两个 sourceId，不调用模型，也不生成现场操作建议。未经验证的适配器仍可由此有限验收入口接受检查，其结果是否成功必须保留。
3. **封存记录生成报告**：`agriculture:source-report` 先验证本地采集档案，再将真实资料转换为候选证据，与指定场景的合成快照组合。它不发送 HTTP 请求，只使用确定性规则；不接受真实模型、注入模型或用合成证据填补抓取缺口。

示例命令会读取真实公开网站，不能用来替代离线单元测试。每次使用新的 run ID：

```sh
npm run agriculture:collect -- --mode live --run-id source-check-001 --max-articles 2
npm run agriculture:source-report -- --collection artifacts/source-collections/source-check-001/collection.json --run-id source-report-001 --scenario pond-weather
npm run agriculture:validate -- --bundle artifacts/agriculture/source-report-001/candidate-bundle.json
```

`--sources` 可限定为其中一个 sourceId。采集档案写入 `artifacts/source-collections/<runId>/`；报告仍写入 `artifacts/agriculture/<runId>/`。报告时钟默认取采集完成时间，不能早于它。指定 `--scenario pond-weather` 仍表示**模拟天气事件**，不表示接通当天真实预警。

## 网络、失败与执行边界

`official-agriculture.ts`（原本地引用：`../lib/sources/official-agriculture.ts`；目标未随本次文档归档上传） 先读取 robots 规则，再取得目录和少量详情。CLI 当前每源最多 2 篇、8 次请求，请求间隔至少 1.2 秒，遵守更长的 crawl-delay；超过支持的等待范围则阻断。单次请求有超时和响应大小限制，重定向逐跳核验同站点与 robots 规则，不访问第三方附件域名。

`live-http.ts`（原本地引用：`../lib/sources/live-http.ts`；目标未随本次文档归档上传） 只允许两个白名单主机的 HTTPS 公共 GET，不携带用户名、密码、Cookie 或默认账号凭据。401/403/429、robots 限制、超时、改版提取失败和请求预算耗尽均保留诊断；不会以登录浏览器、换代理或另一传输方式绕过阻断。

Windows 在显式 live 采集入口使用系统网络栈，静态脚本为 `windows-http.ps1`（原本地引用：`../lib/sources/windows-http.ps1`；目标未随本次文档归档上传），请求参数通过标准输入 JSON 传递。该路径沿用系统证书与网络配置，不修改执行策略、不关闭 TLS 校验、不安装证书或改变系统代理；隐藏子进程窗口。其他平台使用原生 fetch。选定的后端出错后不自动切换后端。

采集结果保留 `success`、`partial`、`empty`、`blocked`、`failed`：

- `success` 表示本次取得资料且采集流程没有记录错误，不表示附件或农艺内容已审核。
- `partial` 保留已取得资料及其余采集错误；`empty` 表示本次没有候选资料进入结果，不能推断相关资料不存在。
- `blocked` / `failed` 保留访问限制或失败原因，不伪装成成功空结果。

采集 CLI 单次等待上限为 30 秒，遇到首次传输超时、连接失败或服务端异常即停止该来源本轮。非 `success` 结果返回非零退出码，同时仍可封存诊断；完整档案允许生成明确的数据缺口报告。来源失败不使用 fixture 冒充抓取正文，也不表示没有农业风险。报告和候选包没有自动通知、平台写入、派单或设备控制权限。

## 资料候选、发布日期与许可

真实资料进入 `toExternalEvidence()`（原本地引用：`../lib/agriculture/external-evidence.ts`；目标未随本次文档归档上传） 后始终为 `synthetic:false`、`reviewState:unreviewed`。报告保留 `synthetic:true` 表示仍含模拟现场，并以 `inputProvenance` 分开表达 `farm:'synthetic'` 与证据的 `external` / `mixed` / `synthetic`。真实抓取不等于真实现场观测，也不等于专业人员审核。

外部资料条目只能作为 `verification`、`severity:info`、`applicability:unknown` 的背景与待核实事项，保留地区、物种、生产阶段、版本、附件和许可限制。不能从机构名称推断适用于本场，不能把旧指导资料当成今日预警，不生成设备控制或用药剂量建议。`validFrom` / `validUntil` 表示记录可供核对的时间边界，不冒充农业措施的生效期。

证据与报告仅保留不超过 180 个 Unicode 字符的原文短节选，附来源名称、URL、原发布机构、抓取时间、版本及许可说明；完整提取文本留在本地采集档案。公开可访问不意味着取得全文再发布许可。论文、代码、模型与数据的许可仍须分别核验，不能因元数据可用就推断全文可转载。

发布日期与获取时间独立保存：只有原文明确给出时区的时间才转为 `publishedAt`；仅日期或无明确时区的本地时间保留 `publishedDate`、`datePrecision` 与原始 `timeRaw`，不捏造午夜或 UTC 时刻；没有日期则保持未知，不能用抓取时间代替。获取时间展示按报告时区转换，并保留时区标签。

附件只识别链接，不下载或解析 PDF、Office 文档、压缩包；图像不做 OCR。存在附件或未转录图片时标记 `extractionStatus:partial` 并保留限制。网页正文短节选不能代表附件内容，也不能声称提取了整份技术文档。

## 封存、版本与完整性

`archive.ts`（原本地引用：`../lib/sources/archive.ts`；目标未随本次文档归档上传） 将解码后的响应文本存为 `raw/<hash>.txt`，不会把它作为可执行 HTML 打开；URL 不直接用作文件路径。目录、文章、请求记录与当时来源目录一起封存，manifest 最后写入，再整体提交。重名运行拒绝覆盖，软链接与越界路径被拒绝。崩溃残留锁或临时目录需先调查，不自动删锁覆盖。

四种 hash 的含义不同：

| 字段 | 可复核内容 |
|---|---|
| 请求 `rawBytesHash` | 采集时、字符集解码前响应字节的 SHA-256；HTTP 内容解压之后计算。当前档案记录该值、字节数与字符集，但不另存原字节文件，不能声称重放时已重新计算原字节 hash。 |
| 请求 `responseHash` 与 `raw/<hash>.txt` | 解码后响应文本的 UTF-8 SHA-256；封存和重放直接验证此文本副本。 |
| 文章 `contentHash` / 证据 `fullTextHash` | 从响应文本提取的完整正文 hash；重放重新解析原文并核对文章元数据、正文、版本及附件清单。 |
| `EvidenceRecord.contentHash` | 报告中短节选的原始文本 hash，不等于完整正文或原 HTTP 字节 hash。 |

同一 URL 变更正文或相关元数据会形成新 `versionHash`；精确重复版本在单次采集中去重，不覆盖历史运行。正文与抓取时间、发布时间、原始引用分开保存，不把重新抓取本身当作正文更新。

`agriculture:source-report` 只重放完整的项目内档案；文章必须与封存的成功详情请求及其响应匹配。`agriculture:validate` 除报告产物校验外，还重新读取来源档案、重建外部证据，并核对报告的证据和来源状态摘要。report、candidate bundle、manifest core 三处的来源与模拟标识必须一致。文件 hash 用于完整性核对，不是发布机构签名、许可证明或人工审批。

## 离线回归与后续接入

来源目录与通用解析测试在 `sources.test.ts`（原本地引用：`../tests/agriculture/sources.test.ts`；目标未随本次文档归档上传）；专用 HTTP、robots、解析与错误分类在 `live-sources.test.ts`（原本地引用：`../tests/agriculture/live-sources.test.ts`；目标未随本次文档归档上传）；档案篡改和重放在 `source-archive.test.ts`（原本地引用：`../tests/agriculture/source-archive.test.ts`；目标未随本次文档归档上传）；证据与报告边界分别在 `external-evidence.test.ts`（原本地引用：`../tests/agriculture/external-evidence.test.ts`；目标未随本次文档归档上传） 和 `source-report.test.ts`（原本地引用：`../tests/agriculture/source-report.test.ts`；目标未随本次文档归档上传）。这些测试使用项目自编的网页样本与注入 transport，不自动请求真实来源，也不能代替采集验收。

```sh
npm run agriculture:check
npm run agriculture:test
```

后续十组来源分别需要真实端点、条款、配额、凭据及单源验证；本轮没有接通 arXiv/OpenAlex、GitHub 或天气预警。将来仍优先使用梁子湖平台既有天气与授权事实快照，区域预报与实测值分别处理，来源故障不得阻塞平台原有监测和控制。
