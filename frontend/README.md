# 前端实现文档

这份文档只描述前端实现，不重复系统级说明。系统定位、后端能力、文档治理规则请以根目录 README.md 为准。

## 目录结构

```text
frontend/
  src/
    App.tsx              应用壳、导航、通知面板、页面切换
    main.tsx             入口文件
    pages/
      MatchAnalysisPage.tsx 命中分析页
      HotspotExplorePage.tsx 热点探索页
      MonitorPage.tsx    关键词管理页
      SettingsPage.tsx   设置页
    components/news/     综合报告、共享新闻卡片与筛选工具
    components/ui/       UI 视觉组件
    hooks/useSSE.ts      SSE 实时连接
    utils/api.ts         API 请求封装
    types/index.ts       前端共用类型
    test/                页面测试与测试初始化
```

## 技术栈

- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- framer-motion
- Testing Library + Vitest

## 页面职责

### App.tsx

- 承载顶层导航和页面切换
- 管理全局通知入口与实时连接状态
- 展示全局 AI 实时进度条，并在 SSE 推送后触发页面静默刷新
- 在移动端提供底部浮动导航

### MatchAnalysisPage.tsx

- 只展示关键词命中的新闻
- 负责关键词、来源、重要性、时间范围筛选
- 顶部综合报告基于当前命中集合生成摘要、风险和动作建议
- 接收关键词 AI 进度事件，显示“批量初筛 / 详细分析 / 完成”状态，并在落库后自动刷新命中列表

### HotspotExplorePage.tsx

- 只展示未命中关键词的热点汇总数据
- 负责来源汇总、重要性、时间范围、榜单/专题视图切换
- 顶部综合报告基于当前热点集合生成全网趋势结论
- 接收热点 AI 进度事件，显示“入库 / 初筛 / 详细分析 / 完成”状态，并在落库后自动刷新热点列表

### components/news/

- ComprehensiveReport.tsx：综合报告组件，按页面当前结果向后端请求 AI 汇总
- ComprehensiveReport.tsx：综合报告组件，按页面当前结果向后端请求 AI 汇总；前端等待时长已放宽到 45 秒，并把样本量收敛到 6 条；当同页新闻仍处于 AI 批处理中时，会先暂停 report 请求；同一批输入会按内容指纹做前端缓存和请求去重，避免重复打满本地模型
- NewsInsightCard.tsx：统一的新闻卡片与展开详情结构
- news-helpers.ts：时间、重要性、来源和 AI 解析辅助函数

#### 当前卡片交互约定

- 普通新闻卡和关键词命中卡都遵守同一条交互规则：
  - 标题点击跳转原文
  - 默认只显示一句 AI 洞察
  - 点击“展开详情”后显示完整洞察、原始摘要、原始内容、验证警告
- 关键词命中卡保留更强的视觉强调，但不再使用另一套详情交互

#### 关键状态

- activeTab：命中分析 / 热点探索 / 关键词 / 设置
- MatchAnalysisPage：search、selectedKeywordId、source、importance、timeRange
- HotspotExplorePage：search、source、importance、timeRange、viewMode

### MonitorPage.tsx

- 提供关键词增删改状态的操作界面
- 展示某个关键词关联到的匹配内容
- 和后端 keywords 路由直接对应

### SettingsPage.tsx

- 拉取后端当前配置映射值
- 编辑数据源启停、云端 AI 配置与本地 LM Studio 配置
- 保存时走 PUT /api/settings
- 当启用本地 LM Studio 时，只保存本地配置块；后端重启后会自动把运行时请求切到本地 OpenAI 兼容地址
- 设置页同时展示“配置文件原始值”和“当前运行时生效值”，避免启用本地模型后把云端备用配置误显示为当前生效值

## API 集成约定

- 所有前端请求统一经由 src/utils/api.ts
- 开发代理在 vite.config.ts 中配置，/api 指向 http://localhost:3001
- 类型定义优先写在 src/types/index.ts，避免页面内部散落临时类型
- SSE 除通知外还消费 hotspot_update 与 ai_progress，用于驱动实时进度和静默刷新

## 常用命令

```bash
npm run dev
npm run test
npm run build
npm run type-check
```

## 测试关注点

当前前端测试重点仍覆盖原 NewsPage 的核心行为，新增拆页主要通过构建和浏览器路径回归验证：

- 统计卡片和热点列表渲染
- 总览页/探索页切换
- 排序、搜索、过滤
- 收藏与刷新
- 关键词命中专区
- 关键词命中卡与普通卡的统一详情交互
- 空状态和加载态

## 前端维护规则

1. 新增页面或调整主要交互时，先更新本文件，再更新根 README.md 中的产品结构描述。
2. 若只是视觉样式微调，不必把每个 class 改动都写进文档，但只要交互模型变了就必须更新文档。
3. 命中分析页和热点探索页承担不同信息层级，改动时不要再把两类内容混回同一页面。
4. 卡片交互规则是共享约定。若普通新闻卡与关键词命中卡再次分叉，必须在改动说明里解释原因。
5. 前端文档只记录前端事实，不重复后端调度、数据库或源站抓取逻辑。

## 最近一次结构性更新

- App 已拆为“命中分析 / 热点探索 / 关键词 / 设置”四页导航
- 命中分析页和热点探索页都已接入 AI 综合报告
- 关键词命中卡与热点卡继续复用统一的展开详情结构
- 命中页和热点页的双列卡片网格已改为顶部对齐，避免一张卡展开后把同排另一张卡拉出大面积空白
