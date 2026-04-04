# 后端实现文档

这份文档聚焦后端代码和运行语义。系统级能力描述、文档治理规则请以根目录 README.md 为准。

## 目录结构

```text
backend/
  src/
    index.ts                 应用入口、路由挂载、调度启动
    routes/                  HTTP 接口与 SSE 通道
    services/                业务服务层
    datasources/crawler.ts   多源采集器
    ai/engine.ts             AI 能力封装
    models/database.ts       SQLite 初始化
    utils/                   配置和日志
    test/                    单元测试
```

## 后端职责

- 提供前端所需的 HTTP API 和 SSE 推送通道
- 周期性采集热点与执行关键词监控
- 调用 AI 能力完成热度、验证、摘要、主题分析
- 把新闻、关键词、命中关系、通知写入 SQLite
- 对配置、日志、基础安全中间件进行统一管理

## 入口流程

backend/src/index.ts 在启动时会做这些事：

1. 读取配置
2. 初始化数据库
3. 注册 helmet、cors、rate-limit、json parser
4. 挂载 keywords、news、settings、notifications 路由
5. 启动 HTTP 服务
6. 启动 scheduler

## 路由说明

### news.ts

- GET /api/news：分页获取热点，支持 source、keyword、keywordId、matchMode、limit、offset、minHotness、maxAgeDays（默认 7 天，传 0 不限制）
- GET /api/news/stats：统计总数、来源分布、平均热度
- POST /api/news/report：根据前端传入的新闻 id 集合，生成命中分析或热点探索综合报告；报告包含核心发现、风险提示、建议动作和**股市影响评估**四个维度；等待时长会跟随 ai.timeout 动态放宽，并在日志里打印实际调用的 provider、model、baseURL
- 若模型返回 403 且提示免费额度耗尽，综合报告会明确返回“AI 额度已用尽”的提示文案，而不是泛化为普通不可用
- LM Studio 等本地 OpenAI-compatible 服务若不接受 `json_object`，后端会在 `json_schema` 失败后自动退回到“纯文本 JSON”解析，而不是继续强行走 `json_object`
- POST /api/news/refresh：手动触发采集
- GET /api/news/:id：获取单条新闻

### keywords.ts

- GET /api/keywords：获取全部关键词
- POST /api/keywords：创建关键词
- DELETE /api/keywords/:id：删除关键词
- PUT /api/keywords/:id/toggle：启停关键词
- GET /api/keywords/:id/matches：查看关键词命中的新闻

### settings.ts

- GET /api/settings：同时返回配置文件中的原始可编辑值，以及 loadConfig 解析后的当前运行时生效值
- PUT /api/settings：把前端提交的 dataSources、ai、ai.lmStudio、notifications 回写到 config/config.json

### notifications.ts

- GET /api/notifications/stream：SSE 通道，包含初始 connected 事件和 30 秒心跳
- SSE 除 notification 外，还会推送 hotspot_update 与 ai_progress，分别表示热点已入库以及 AI 分析进度
- GET /api/notifications：拉取通知列表和未读数
- PUT /api/notifications/:id/read：单条已读
- PUT /api/notifications/read-all：全部已读
- DELETE /api/notifications：清空通知

## 服务层说明

### newsService

- 负责新闻查询与统计
- 支持按 matchMode 区分“全部 / 已命中 / 未命中”结果集
- 通过 title + source 去重
- upsert 时会按条件保留更高热度或更完整的 AI 分析结果
- 负责关键词命中关系查询、批量按 id 取新闻和写入

### keywordService

- 负责关键词增删与状态切换
- 维护 lastCheckedAt

### notificationService

- 负责通知落库
- 管理 SSE 客户端列表
- 广播热点更新和关键词命中

### scheduler

- 关键词监控：每 5 分钟运行一次
- 热点采集：每 10 分钟运行一次
- 服务启动后 3 秒会先跑一次初始任务
- 使用并发锁避免同一任务重入

## 采集与 AI 数据流

### 热点采集

1. crawler.collectHotspots() 拉取多源热点
   - 已接入源：HackerNews、Bing、Google、DuckDuckGo、Twitter、微博、B站、搜狗、百度、知乎、头条、36氪(RSS)、IT之家(RSS)、虎嗅(RSS)、抖音、澎湃新闻、掘金、少数派、V2EX、豆瓣、贴吧、虎扑、凤凰网、GitHub Trending、Solidot、华尔街见闻、LinuxDO、FreeBuf、牛客
2. 在服务端先把正文压缩成短摘要，再以默认热度写入数据库，保证数据不丢
3. 按固定批次把“标题 + 来源 + 时间 + 压缩摘要”提交给 AI，返回带稳定 id 的热点分数、分类、优先级和风险标记
4. 按批量分数选出 Top K 候选，再逐条做热度复核、真实性校验和中文标题/摘要整理
5. 通过 SSE 推送热点入库、AI 初筛和详细分析进度，前端可在落库后自动刷新状态

### 关键词监控

1. 读取全部活跃关键词
2. 使用 aiEngine.expandKeyword 扩展变体
3. 对多个变体并行搜索并按 URL 去重
4. 先把结果压缩成短摘要，并批量提交给 AI 做命中初筛、优先级和风险判断
5. 仅对高分候选逐条执行内容验证、热度复核和摘要生成
6. 写入 news 并记录 keyword_matches
7. 通过 ai_progress SSE 推送关键词的批量初筛、详细分析和完成状态，并对满足条件的新命中内容发出通知

### 综合报告

1. 前端根据当前页面筛选结果挑选最多 10 条新闻 id 提交到 POST /api/news/report
2. 路由按 id 取回已入库新闻，复用 summary、hotness 和 aiAnalysis 作为报告输入
3. aiEngine.generateNewsReport 生成 headline、summary、keyFindings、riskAlerts、recommendedActions
4. 若 AI 不可用或在基于 ai.timeout 计算出的等待窗口内仍未返回，则返回可展示的保底结构，保证前端综合报告区域可稳定渲染

## 数据库

SQLite 文件默认位于 data/news.db，数据库初始化在 models/database.ts。

核心表：

- keywords
- news
- keyword_matches
- notifications

核心索引：

- news.source
- news.hotness DESC
- news.createdAt DESC
- keywords.active
- notifications.read
- keyword_matches(keywordId, newsId) 唯一索引

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run test
npm run test:ai
npm run type-check
npm run fix:legacy-verification
```

其中 `npm run test:ai` 会直接对当前 config/config.json 中配置的 AI 服务发送最小测试请求，分别验证：

- 普通 chat completion
- json_object 返回
- json_schema 结构化输出

如果当前 provider 是百炼兼容接口，后端会默认优先使用 json_object 模式；此时 json_schema 失败只视为能力探测，不视为后端不可用。
如果当前 provider 是 lmstudio，测试脚本会把 json_object 视为能力探测项，因为部分 LM Studio 运行时虽然暴露 OpenAI-compatible 端点，但实际只接受 json_schema 或 text。

## 后端维护规则

1. 只要新增或修改 API 路由，就必须同时更新本文件和根 README.md 的 API 一览。
2. 只要调整 scheduler 周期、锁逻辑或启动即执行行为，就必须更新本文件中的调度说明。
3. 若新增表、字段、索引或去重规则，必须同步更新 README.md 与本文件中的数据层描述。
4. settings.ts 直接回写 config/config.json，修改配置结构时必须同步更新 config/README.md。
5. ai.lmStudio.enabled 为 true 时，loadConfig 会在运行时把 provider、apiUrl、apiKey、model 切到本地 LM Studio 配置；云端配置仍保留在原字段中，便于切回。
6. 若某个数据源只在配置中声明但尚未在 crawler 中实现，不要把它写成“已接入”。

## 当前已知运行特征

- Windows 下部分搜索引擎页面在 Node HTTP 客户端中可能超时，代码中已加入 PowerShell 兜底逻辑。
- B 站数据源在模板配置中默认关闭。
- 热点采集会先全量入库再补 AI 分析，数据库里可能短时间存在默认热度再被批量分数和深分析结果覆盖的记录。
- 关键词监控已改为“批量初筛 + Top K 深分析”，因此低分命中会更快入库，但只对高分候选执行完整 AI 复核。
