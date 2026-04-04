# AI热点新闻监控系统

这是一个面向热点监控场景的全栈系统：后端负责多源采集、AI 分析、关键词匹配、通知推送与持久化，前端负责把高价值热点以产品化的方式呈现给操作者。当前工作区中的代码、接口、配置和测试都已经可运行，这份文档是整个项目的系统级说明和文档维护基线。

## 文档定位

如果你是新的维护者，先读这份文档，再按需要继续阅读子文档：

| 文档 | 作用 | 维护边界 |
|---|---|---|
| README.md | 系统总说明、产品语义、架构、API 全览、文档维护规则 | 任何跨前后端的功能变化都要更新这里 |
| QUICK_START.md | 最短启动路径、常见启动问题 | 只维护启动与联调步骤 |
| frontend/README.md | 前端页面、组件和交互模式说明 | 只维护前端实现细节 |
| backend/README.md | 后端路由、服务、调度、数据流说明 | 只维护后端实现细节 |
| config/README.md | 配置项与环境说明 | 只维护配置语义 |
| DEVELOPMENT_PLAN.md | 阶段性改造记录和交付轨迹 | 只记录进度与历史，不重复系统说明 |

## 首次版本文档维护规则

这是首版文档治理规则，后续任何 AI 或人工维护都必须遵守：

1. README.md 是系统级事实源。凡是涉及产品定位、系统架构、关键流程、接口全景、文档规则的改动，都必须同步更新 README.md。
2. 子文档只写自己的边界，不复制系统级结论。若同一事实同时出现在 README.md 和子文档，子文档必须只保留实现细节或跳转说明。
3. 代码改动和文档改动必须同批提交。新增页面、接口、数据源、配置项、调度规则时，不允许只改代码不改文档。
4. 文档中的端口、命令、接口、表结构、字段、路由，必须以工作区现有代码为准，不能凭历史描述或模板推断。
5. 文档中的状态描述只允许使用“已实现 / 已接入 / 已验证 / 待完善 / 已废弃”这类可核对的词，不写“计划中但可能已完成”这种模糊表述。
6. 若无法在当前代码中验证某项描述，必须删掉、降级为“待确认”，或补充来源文件位置后再保留。
7. 任何新维护者接手时，默认检查顺序为：README.md → QUICK_START.md → 对应子文档 → 相关源码与测试。
8. 修改文档时优先修正事实不一致，其次再优化措辞。禁止为了“写得更完整”而保留旧事实。

## 产品定位

这个系统解决的是“从多个公开信息源持续发现热点，并快速判断哪些热点值得跟进”的问题，核心面向以下场景：

- 持续监控 AI、技术、行业或品牌相关舆情
- 用关键词捕获与自身业务直接相关的热点
- 把全网热点和自己的监控命中分层呈现，减少信息淹没
- 用 AI 辅助完成热度判断、真实性校验和摘要提炼
- 在浏览器前台实时查看热点、收藏重点、按主题或榜单深入探索

## 当前可用能力

- 多源热点采集：搜索引擎、技术社区、中文资讯源、社交平台与 RSS 源都可通过统一爬虫入口采集
- 关键词监控：支持新增、删除、启停关键词，并把命中结果落库和通知
- AI 分析：支持热点压缩摘要批量评分、关键词命中批量初筛、内容校验、摘要/标题整理、主题批量分析、关键词扩展
- AI 兼容适配：对百炼等 OpenAI 兼容接口默认优先使用 json_object，避免 json_schema 兼容差异导致请求失败
- 本地模型接入：AI 配置已支持单独声明 LM Studio 本地 OpenAI 兼容接口，启用后后端会优先切到 http://localhost:1234/v1 这类本地服务
- 实时通知：后端通过 SSE 推送热点更新和关键词命中通知
- 热点产品页：前端已拆为“命中分析”“热点探索”“关键词”“设置”四个页面，并在命中分析与热点探索中提供 AI 综合报告
- 报告容错：综合报告链路已加入 12 秒超时降级，调度任务占用 AI 时也不会让前端长时间卡在加载态
- 额度提示：当模型免费层额度耗尽时，综合报告会直接提示额度不足，便于区分“服务异常”和“账户额度问题”
- 卡片交互统一：普通新闻卡与关键词命中卡都使用“短卡 + 展开详情”结构，标题点击跳转原文
- 本地持久化：SQLite 存储 news、keywords、keyword_matches、notifications

## 系统架构

### 运行结构

```text
浏览器
  └─ 前端应用 React 18 + Vite + TypeScript  http://localhost:3000
  ├─ 命中分析页 MatchAnalysisPage
  ├─ 热点探索页 HotspotExplorePage
       ├─ 关键词监控页 MonitorPage
       └─ 设置页 SettingsPage

前端通过 /api 代理访问后端

后端服务 Node.js + Express + TypeScript   http://localhost:3001
  ├─ routes: keywords / news / settings / notifications
  ├─ services: keywordService / newsService / notificationService / scheduler
  ├─ datasources: crawler 聚合多源抓取
  ├─ ai: AIEngine 负责热度、验证、摘要、主题分析
  └─ models: better-sqlite3 + SQLite 表初始化
```

### 核心数据流

1. 调度器启动后立即触发一次热点采集和关键词监控。
2. 热点采集任务每 10 分钟运行一次，先抓取多源热点并生成压缩摘要，再入库，随后批量做热点初筛，最后只对 Top K 候选做逐条深分析。
3. 关键词监控任务每 5 分钟运行一次，先扩展关键词，再对多个变体执行并行搜索与去重，随后批量做命中初筛，只对高分候选做 AI 复核与摘要整理。
4. newsService 负责新闻写入、去重、查询和统计；keyword_matches 负责关键词与新闻的关联关系。
5. notificationService 负责通知落库和 SSE 广播；前端 useSSE 负责接收实时推送。
6. 前端将结果拆分为命中分析页和热点探索页，并在每个页面顶部基于当前结果生成 AI 综合报告。

## 代码结构地图

```text
frontend/
  src/
    App.tsx                 应用壳、导航、通知容器
    pages/
      MatchAnalysisPage.tsx 命中分析页
      HotspotExplorePage.tsx 热点探索页
      MonitorPage.tsx       关键词增删、匹配结果查看
      SettingsPage.tsx      数据源、AI、通知配置
    components/news/        综合报告、新闻卡片与共享过滤工具
    hooks/useSSE.ts         SSE 实时连接
    utils/api.ts            前端 API 封装
    test/                   前端页面测试

backend/
  src/
    index.ts                Express 入口、路由挂载、调度启动
    routes/                 HTTP 与 SSE 接口
    services/               业务逻辑层
    datasources/crawler.ts  多源采集与搜索入口
    ai/engine.ts            AI 能力封装
    models/database.ts      SQLite 建表与连接
    test/                   后端单元测试

config/
  config.example.json       默认配置模板
  config.json               实际运行配置，不建议提交敏感信息

skills/
  content-verify/
  hotspot-detection/
  keyword-monitor/
```

## 前端产品结构

### 命中分析页 MatchAnalysisPage

- 仅展示已命中关键词的新闻
- 支持关键词、来源、重要性、时间范围筛选
- 顶部通过综合报告汇总当前命中结果的核心结论、风险与建议动作

当前卡片交互约定如下：

- 标题是原文入口，有 url 时直接新窗口打开来源链接
- 卡片正文只显示一句 AI 洞察摘要，降低列表密度
- 点击“展开详情”后，统一展示完整洞察、原始摘要、原始内容、验证警告
- 关键词命中卡与普通新闻卡采用同一详情结构，只保留视觉强调上的差异

### 热点探索页 HotspotExplorePage

- 仅展示未命中关键词的多源热点数据
- 提供来源汇总、重要性筛选、时间范围筛选、榜单视图和专题视图
- 顶部综合报告根据当前热点列表汇总全网趋势、风险点与观察建议

### 关键词监控页 MonitorPage

- 管理关键词的新增、删除、启停
- 查看每个关键词的匹配结果
- 为关键词监控任务提供操作入口

### 设置页 SettingsPage

- 查看并修改数据源启停状态
- 配置 AI provider、模型、API 地址与密钥
- 配置是否优先使用本地 LM Studio 接口，以及本地模型 ID、地址和占位 Key
- 配置通知开关

## 后端模块说明

### 路由层

| 路由 | 说明 |
|---|---|
| GET /health | 健康检查 |
| GET /api/news | 获取热点列表，支持 source、keyword、keywordId、matchMode、limit、offset、minHotness |
| GET /api/news/stats | 获取新闻总量、来源分布、平均热度 |
| POST /api/news/report | 基于当前新闻集合生成命中分析或热点探索综合报告 |
| POST /api/news/refresh | 手动触发热点采集和关键词监控 |
| GET /api/news/:id | 获取单条新闻详情 |
| GET /api/keywords | 获取关键词列表 |
| POST /api/keywords | 新增关键词 |
| DELETE /api/keywords/:id | 删除关键词 |
| PUT /api/keywords/:id/toggle | 启停关键词 |
| GET /api/keywords/:id/matches | 获取某关键词的命中新闻 |
| GET /api/settings | 获取当前设置 |
| PUT /api/settings | 更新配置文件中的数据源、AI、通知设置 |
| GET /api/notifications/stream | SSE 实时推送通道 |
| GET /api/notifications | 获取通知列表 |
| PUT /api/notifications/:id/read | 标记单条通知已读 |
| PUT /api/notifications/read-all | 全部标记已读 |
| DELETE /api/notifications | 清空通知 |

### 服务层

- keywordService：关键词 CRUD、状态切换、最近检查时间维护
- newsService：新闻查询、去重写入、统计、关键词命中查询
- notificationService：通知落库、已读状态、SSE 客户端管理
- scheduler：启动定时任务、手动触发采集、并发锁控制

### 数据存储

SQLite 数据库位于 data/news.db，当前核心表如下：

- keywords：监控关键词定义
- news：新闻主体，包含标题、摘要、来源、热度、验证信息、AI 分析结果
- keyword_matches：关键词和新闻的关联关系
- notifications：前端通知中心的数据源

## 配置与运行

### 环境前置

- Node.js 18+
- npm
- 可选的 OpenAI API Key
- 可选的 Twitter API Key

### 启动方式

最稳妥的开发启动方式：

```bash
cd backend
npm install
npm run dev

cd ../frontend
npm install
npm run dev
```

默认端口：

- 前端：http://localhost:3000
- 后端：http://localhost:3001

也可以使用工作区根目录下的 start.bat 在 Windows 中同时拉起两个终端窗口。

### 配置文件

运行前需要准备 config/config.json。可先从模板复制：

```bash
copy config\config.example.json config\config.json
```

关键配置块：

- server：后端监听地址和端口
- database：SQLite 文件路径
- datasources：各数据源是否启用、抓取频率、限额、API 地址
- ai：provider、模型、API 地址、token/timeout
- ai.lmStudio：本地 LM Studio OpenAI 兼容服务的启用状态、地址、占位 Key 与本地模型 ID
- notifications：Web 通知配置
- crawler：超时、代理、频率限制、UA
- security：CORS 与 rate limit

更详细的配置说明见 config/README.md。

## 数据源范围

当前模板里已经包含以下数据源配置：

- Twitter
- HackerNews
- Bing
- Google
- DuckDuckGo
- 微博
- 搜狗
- 百度
- 知乎
- 今日头条
- 36氪（RSS）
- IT之家（RSS）
- 虎嗅（RSS）
- B 站（默认关闭）
- 抖音
- 澎湃新闻
- 掘金
- 少数派
- V2EX
- 豆瓣
- 百度贴吧
- 虎扑
- 凤凰网
- GitHub Trending
- Solidot
- 华尔街见闻
- LinuxDO（默认关闭）
- FreeBuf
- 牛客（默认关闭）

说明：是否“出现在配置中”和“已被 crawler 实际接入”必须以代码实现为准。变更数据源时，README.md 与 config/README.md 必须一起更新。

## 测试与验证

前端：

```bash
cd frontend
npm run test
npm run build
```

后端：

```bash
cd backend
npm run test
npm run type-check
```

联调时至少检查：

- 浏览器可以访问 http://localhost:3000
- /health 返回正常
- 热点页能拉到 /api/news 和 /api/news/stats
- 关键词页可以新增、启停、删除关键词
- 通知流能建立 SSE 连接

## 维护者接手建议

如果新的 AI 或工程师需要继续维护，建议按这个顺序进入：

1. 先读 README.md，理解系统边界、产品语义和文档规则。
2. 按任务类型选择 frontend/README.md、backend/README.md 或 config/README.md。
3. 修改前先检查对应测试文件和已有运行命令。
4. 改动完成后同时更新系统文档和边界文档。
5. 在 DEVELOPMENT_PLAN.md 记录本轮阶段性变化，避免历史断层。

## 已知运行特征

- 热点采集和关键词监控在服务启动后会自动执行一次，随后按计划周期运行。
- 关键词搜索会先做 AI 语义扩展，再做多变体搜索，因此数据量和外部请求量会高于单关键词直搜。
- Windows 环境下，部分搜索源在 Node HTTP 客户端中可能超时，代码中已经针对部分搜索页面加入 PowerShell 兜底抓取逻辑。
- 前端测试环境里仍可能看到非阻断的 React act 警告，这不会导致当前用例失败，但后续若改测试基建可继续收口。

## 子文档入口

- frontend/README.md
- backend/README.md
- config/README.md
- QUICK_START.md
- DEVELOPMENT_PLAN.md
OPENAI_API_KEY=sk-xxx
TWITTER_API_KEY=xxx
APP_PORT=3001
LOG_LEVEL=info
NODE_ENV=development
```

## 📖 API文档

### 关键词管理
```
GET    /api/keywords           # 获取所有关键词
POST   /api/keywords           # 添加新关键词
DELETE /api/keywords/:id       # 删除关键词
```

### 热点新闻
```
GET    /api/news              # 获取热点新闻
GET    /api/news/trending     # 获取趋势统计
GET    /api/news/verify/:id   # 验证新闻真实性
```

### 系统设置
```
GET    /api/settings          # 获取设置
PUT    /api/settings          # 更新设置
```

## 🎨 UI特性

✨ **现代设计语言**
- 深色主题（护眼配色）
- 卡片式布局（玻璃态效果）
- 渐变背景（品牌色强调）

📱 **完全响应式**
- 移动端优先
- 平板和桌面适配
- 无缝断点切换

💫 **交互体验**
- 平滑动画过渡
- 悬停视觉反馈
- 实时通知提醒

## 🔐 安全性

- ✅ HTTPS支持
- ✅ CORS跨域保护
- ✅ 速率限制
- ✅ API密钥隐藏
- ✅ SQL注入防护
- ✅ XSS防护

## 📚 文档

- [前端开发文档](./frontend/README.md)
- [后端开发文档](./backend/README.md)
- [配置文档](./config/README.md)

## 🤝 贡献

欢迎提交PR和Issue！

## 📄 许可证

MIT License

---

**更新时间**: 2026-03-31
**项目状态**: 🚧 开发中 (阶段1已完成)
