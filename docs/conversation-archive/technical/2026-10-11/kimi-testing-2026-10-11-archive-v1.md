> 文档归档副本｜原文日期：原始日期未单独确认；本目录日期为快照日期｜归档日期：2026-10-11｜归档版本：v1。
> 保留当时结论；代码与部署状态以原文记录为准。归档上传不等于业务代码已同步或线上验收通过。

# 官方 Kimi K2.6 小预算独立测试

第 10 步已实现测试代码与手动工作流。当前验收范围是离线回归和输入预检；尚未使用用户密钥调用真实 Kimi，也未在 GitHub 执行工作流。真实可用性需以配置密钥后的运行结果为准。

## 1. GitHub 上填写的位置与操作顺序

1. 先将本开发副本的完整代码同步到 `No1dry/AgriTwin-Intelligence`，包含前九步改造、`package-lock.json` 和 `.github/workflows/kimi-smoke.yml`。只上传工作流会缺少运行代码。不要上传 `.env.kimi.local`、`node_modules` 或 `artifacts`。
2. 工作流文件需出现在仓库默认分支，然后进入仓库 **Settings → Secrets and variables → Actions → New repository secret**。
3. Name 填 **`MOONSHOT_API_KEY`**，Secret 填官方平台 API Key。应使用 **Secrets**，不是明文 Variables；代码中不需要填写密钥。
4. 进入 **Actions → Kimi manual smoke test → Run workflow**。建议先保持 `run_live=false`，只验证环境和完整离线测试。
5. 离线通过后再运行一次，勾选 **`run_live`**。同一轮会先执行离线检查，通过后才把密钥注入模型测试步骤。
6. 查看运行 Summary；下载本轮名为 `kimi-<run_id>-<run_attempt>` 的 artifact，打开其中的 `report.html`。保留七天，失败时只要已产生运行文件也会上传。

本地开发副本没有配置 Git remote，本轮没有推送。添加 Secret 本身不会使尚未同步的工作流出现。手动触发的默认分支要求见 [GitHub 文档](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。

工作流只允许手动启动，无 push、pull_request 或定时触发。默认值 false；代码变更不会自动花费模型额度。仓库权限只有读取，依赖安装和离线测试步骤不持有模型密钥。工作流使用 JSON 形式的合法 YAML，并固定官方 action 的提交版本。

## 2. 本地填写的位置

项目根目录 **`.env.kimi.local` 第 3 行**：

```dotenv
MOONSHOT_API_KEY=
```

在等号后粘贴密钥并保存。本会话已预建空文件；其他机器从 .env.example（原本地引用：`../.env.example`；目标未随本次文档归档上传） 复制得到。`.env.kimi.local` 被 Git 忽略，模板保持空值。只需填写此项，模型和官方地址已经固定在 kimi.ts（原本地引用：`../lib/ai/kimi.ts`；目标未随本次文档归档上传）。不要把密钥写进源码、报告或聊天。

需要 Node.js ≥ 22.15，建议 Node.js 24，与 Actions 一致。进入项目目录运行：

```powershell
npm ci
npm run agriculture:check
npm run agriculture:test
npm run agriculture:model-test -- --mode preflight --run-id kimi-preflight-1
npm run agriculture:model-test -- --mode live --run-id kimi-live-1
npm run agriculture:model-validate -- --run artifacts/model-evaluations/kimi-live-1
```

`preflight` 验证三个输入与请求体预算，生成 `preflight_ready`，不调用模型。`live` 才发送请求；缺少 Key 会明确失败。每轮使用新 `run-id`，已有目录不能覆盖。npm 模型测试命令读取 `.env.kimi.local`；若进程中已设置同名环境变量，Node 优先使用进程环境变量。其他农业演示/采集入口不读取此文件。

## 3. 三次请求用来发现哪些问题

| 次序 | 场景 | 检查目标 |
|---|---|---|
| 1 | 农业参考资料与未确认的模拟现场 | API/模型可用，JSON 格式正确，引用来自给定原文，不能把背景资料认定为本场措施 |
| 2 | 缺观测、批次和可信参考 | 返回证据不足，完整保留缺口，不补造现场数据 |
| 3 | 资料中带显式恶意指令的合成样本 | 不执行编造测值、伪造审核状态、宣布安全或输出设备命令的指令 |

默认全部使用项目自编工程样本，明确标记 `synthetic_reference / synthetic_injection`，不伪装为官方发布。这样 CI 无需抓网页、传感器或额外账号，输入小且可以重放。第三项只是一个显式攻击样本，不能据此宣称普遍抗提示注入。

本地可改用第 9 步真实封存资料进行第一项测试：

```powershell
npm run agriculture:model-test -- --mode preflight --collection artifacts/source-collections/step9-live-20261004-d/collection.json --run-id kimi-sources-preflight-1
npm run agriculture:model-test -- --mode live --collection artifacts/source-collections/step9-live-20261004-d/collection.json --run-id kimi-sources-live-1
```

程序先检查清单、原文 hash 并重新解析缓存，再选择最多四篇、每篇前 320 个 Unicode 字符作为上下文，保留发布机构、日期、URL、版本标识和提取缺口。模型逐项引用最多 180 字符。该模式会把这些公开资料节选发送给官方 Kimi；不发送本地 Key 以外的凭据或真实农场观测。第二、三项继续使用自编样本。空采集不会由模拟资料补齐。默认 Actions 不携带本地采集档案；真实资料模型测试的复验需要同时保留原采集目录。

## 4. 费用边界

| 限制 | 固定值 |
|---|---|
| 模型与地址 | `kimi-k2.6`，`https://api.moonshot.cn/v1/chat/completions` |
| 每轮请求数 | 最多 3 次，串行，无自动重试、修复调用或工具调用 |
| 每次最大输出 | 1024 token；全轮最大输出 3072 token |
| 每次请求体 | UTF-8 编码最多 16000 字节，包含完整 JSON 参数；不是 16000 token |
| 思考模式 | `thinking.type=disabled` |
| 时间 | 每次最多 60 秒，全轮调用阶段最多约 185 秒；GitHub job 最多 10 分钟 |
| 用量异常 | 未返回有效 usage 时记为未知并停止，不当作零费用 |

API 支持与参数依据 [Kimi K2.6 官方快速开始](https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart) 和 [JSON Mode 官方说明](https://platform.kimi.com/docs/guide/use-json-mode-feature-of-kimi-api)。适配器固定官方地址、拒绝重定向，不自动切换代理服务或模型。

本版约束请求数、输入大小和输出 token，**没有承诺人民币硬封顶**。费用取决于官方计费，`costCny` 保留 null；实际输入、输出与总 token 写入产物，金额以 [官方定价](https://platform.kimi.com/docs/pricing/chat) 和账号账单为准。超时不代表服务端未计费。手动重新运行是新的一轮预算，先看失败原因再决定是否重跑。GitHub Actions 自身用量与模型费用分开计算。

## 5. 结果、失败诊断与验收

目录：`artifacts/model-evaluations/<run-id>/`。

| 文件 | 内容 |
|---|---|
| `evaluation.json` | 三个固定输入、来源、模型尝试、脱敏响应、自动检查、usage、代码和输入 hash |
| `report.html` | 可离线打开的中文报告，模型输出按文本转义展示，失败响应可用于排查 |
| `progress.json` | 每次请求前后持久化的进度；被中断时仍保留可能已计费的尝试 |
| `manifest.json` | 完整运行最后写入，绑定上述产物；缺少它表示尚未封存完成 |

`liveRequests` 是官方适配器尝试计数，保守记录到达调用边界的尝试，不等于可证明服务端成功收到了请求。测试注入的响应使用 `execution=injected_test`，该计数始终为零。成功产物保留 `humanReview=pending`、`semanticVerification=not_performed`、`allowOperationalUse=false`；`protocol_passed` 只表示自动协议检查通过。它不生成或修改农业候选包，也不写入梁子湖平台。

| 诊断 | 处理 |
|---|---|
| `MOONSHOT_API_KEY_MISSING` | 核对 Secret 名称或本地空值；此情况不会调用 API |
| `KIMI_HTTP_AUTH` | 核对官方 Key 是否有效及平台归属，不自动重复尝试 |
| `KIMI_HTTP_RATE_LIMITED` / `KIMI_HTTP_ERROR` | 检查官方控制台额度、限流及服务状态；不保存可能包含敏感内容的原始错误体 |
| `KIMI_TIMEOUT` / `KIMI_NETWORK_ERROR` | 核对网络与平台日志；保留可能已计费记录，本轮停止 |
| `KIMI_TRUNCATED` | 输出达到限制而被截断；本轮失败，保留官方用量，不自动增加预算 |
| `KIMI_USAGE_UNKNOWN` | 官方 usage 缺失或不合法；后续案例跳过，不能宣称免费 |
| `EVAL_*` | 结构、引用、缺口、限制或数字/单位规则不满足；查看已保存的脱敏输出修正，不自动付费重写 |

离线测试通过后，真实验收至少需要：一轮官方调用三项通过、实际 usage 可见，再逐条人工核对解释是否忠于引用、是否混淆模拟与真实、是否越过资料适用条件。协议检查不能证明自由解释语义正确，也不能完成农业专业审核。
