# AI热点新闻监控系统 - 后端开发文档

## 项目结构

```
backend/
├── src/
│   ├── index.ts              # 应用入口
│   ├── routes/               # API路由
│   │   ├── keywords.ts       # 关键词相关接口
│   │   ├── news.ts           # 新闻相关接口
│   │   └── settings.ts       # 设置相关接口
│   ├── services/             # 业务逻辑服务
│   ├── models/               # 数据模型
│   ├── datasources/          # 数据源模块
│   │   └── crawler.ts        # 爬虫引擎
│   ├── ai/                   # AI相关模块
│   │   └── engine.ts         # AI识别引擎
│   └── utils/                # 工具函数
│       ├── config.ts         # 配置加载
│       └── logger.ts         # 日志
├── package.json
├── tsconfig.json
└── .gitignore
```

## API端点

### 关键词管理
- `GET /api/keywords` - 获取所有监控关键词
- `POST /api/keywords` - 添加新关键词
- `DELETE /api/keywords/:id` - 删除关键词

### 热点新闻
- `GET /api/news` - 获取热点新闻（支持分页、源筛选）
- `GET /api/news/trending` - 获取趋势统计
- `GET /api/news/verify/:id` - 验证新闻真实性

### 系统设置
- `GET /api/settings` - 获取当前设置
- `PUT /api/settings` - 更新设置

## 环境配置

配置文件位置：`config/config.json`

关键配置项：
- `ai.apiKey` - OpenAI API Key
- `datasources.*.apiKey` - 各数据源API Key
- `datasources.*.enabled` - 启用/禁用数据源
- `crawler.rateLimiting` - 频率限制配置

## 启动服务

### 开发模式
```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务 (带热重载)
```

### 生产模式
```bash
npm run build   # 编译TypeScript
npm start       # 启动生产服务
```

## 数据源说明

| 源 | 实现状态 | 说明 |
|----|--------|------|
| Twitter | ⏳ TODO | 通过API获取最新推文 |
| HackerNews | ✅ 已实现 | 从官方API获取 |
| Bing | ⏳ TODO | Web爬虫 |
| Google | ⏳ TODO | Web爬虫 |
| 微博 | ⏳ TODO | Web爬虫 |
| B站 | ⏳ TODO | Web爬虫 |
| 搜狗 | ⏳ TODO | Web爬虫 |
| DuckDuckGo | ⏳ TODO | Web爬虫 |

## AI模块说明

`AIEngine` 提供以下功能：

1. **热点检测** (`detectHotness`)
   - 判断新闻是否是真实热点
   - 返回热度评分和分析理由

2. **内容验证** (`verifyContent`)
   - 检测虚假或伪造内容
   - 返回真实性评分和警告信息

3. **摘要生成** (`summarizeNews`)
   - 将长文本新闻浓缩为一句话

## 已修复的Bug

| 日期 | 模块 | 描述 |
|------|------|------|
| 2026-04-02 | notificationService | `markAllAsRead()` SQL 逻辑错误：`SET read = 0 WHERE read = 0` 修改为 `SET read = 1 WHERE read = 0` |
