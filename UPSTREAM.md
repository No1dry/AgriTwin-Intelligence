# 代码来源与初始化记录

初始化日期：2026-09-22。

| 项目 | 值 |
|---|---|
| 新项目 | `No1dry/AgriTwin-Intelligence` |
| 可见性 | 私有 |
| 来源仓库 | `No1dry/FeishuBrief`（私有） |
| 来源分支 | `main` |
| 来源提交 | `ece7f677ff1436f1915d8a14200bd46a1fd5a024` |
| 来源 tree | `7e8142ceaedaeed3ae36f113bdadc403e7407853` |
| 来源文件数 | 105 个已跟踪文件 |
| 复制形式 | 固定提交的代码快照，独立 Git 历史，不是 GitHub fork |

## 保留内容

继承全部来源快照文件，包括源码、锁文件、信源配置、编辑配置、检查脚本、文档、图像、许可证及原始工具配置。初始阶段不修改采集和模型运行算法，农业专用模块将按接入方案单独建设。

## 文件映射与初始化差异

| 来源文件 | 新位置或处理方式 |
|---|---|
| `README.md` | 原样保留为根目录 `README.upstream.md`；新建农业项目 `README.md` |
| `.github/workflows/daily.yml` | 原样保留为 `ops/upstream-workflows/daily.yml.disabled` |
| `.github/workflows/source-smoke.yml` | 原样保留为 `ops/upstream-workflows/source-smoke.yml.disabled` |
| `AGENTS.md` | 增加农业项目范围和停用工作流说明，保留下方上游指南 |
| 其余来源文件 | 路径及内容保持不变 |

新增本文件、农业接入方案和项目 README。新 README 保留来源清单生成标记，现有 `readme:sources` 与 `readme:check` 仍可使用；清单标注为继承的技术信源。

## 本次不属于复制对象的运行状态

仓库 Secrets、Variables、Deploy Keys、Actions 运行历史、原日报站点内容，以及本机 `.env.local`、模型日志和未跟踪文件没有迁移。独立前端 `No1dry/FeishuBrief-Console` 也不在此后端快照内。

原始文档和脚本可能提及 FeishuBrief、DailyBrief、原工作台及日报站点，这些是来源记录，不代表新项目已接入原生产环境。工作流模板的说明属于上游行为，启用前必须重新配置和验证。

本仓库不设置活动工作流，不复制通知凭证，不执行生产生成或推送。今后启用调度时，应先实现只生成模式并验证新的通知目标配置。

## 后续维护

农业模块在本仓库迭代，原 FeishuBrief 保持独立。同步上游修复时按提交审查差异，不覆盖农业配置、通知策略和数据协议；需要升级基线时更新此记录。

许可与署名原样保留在 [LICENSE](LICENSE)。原始使用指南见 [README.upstream.md](README.upstream.md)，农业接入设计见 [方案 V1](docs/agriculture-digital-twin-integration-v1.md)。
