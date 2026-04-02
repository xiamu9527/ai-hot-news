# 🔥 AI热点新闻监控系统

一个功能完整的**实时热点新闻发现和监控平台**，集成多个信息源（社交媒体、搜索引擎、技术社区），使用AI识别和验证热点内容。

## ✨ 核心功能

- 🔍 **多源热点聚合** - 从Twitter、HackerNews、搜索引擎、微博等11+数据源实时获取内容
- 🤖 **AI热点识别** - 使用OpenAI识别真正的热点，过滤虚假信息
- 👁️ **关键词监控** - 自定义关键词，实时收到相关热点通知
- 📊 **热点排行** - 显示热度排行榜和趋势分析
- 🎨 **酷炫UI** - Aceternity UI设计体系，framer-motion动画，鼠标跟踪发光效果
- ⚡ **Web实时推送** - 通过SSE推送新热点通知
- 🤝 **Agent Skills** - 可封装为其他AI使用的技能包

## 🏗️ 系统架构

```
┌─────────────────────────────────┐
│  前端 (React 18 + TypeScript)    │ ← 访问 http://localhost:3000
├─────────────────────────────────┤
│                                 │
│  关键词管理 | 热点展示 | 设置    │
└──────────────┬──────────────────┘
               │ HTTP/WebSocket
┌──────────────▼──────────────────┐
│ 后端 (Node.js + Express)         │ ← http://localhost:3001
├─────────────────────────────────┤
│                                 │
│  API 路由 → 业务逻辑             │
│  ↓                              │
│  爬虫引擎 ← 多源聚合             │
│  ↓                              │
│  AI识别引擎 ← 热点验证           │
│  ↓                              │
│  SQLite数据库 ← 数据持久化       │
│                                 │
└─────────────────────────────────┘

数据源集成：
├─ Twitter API      (社交媒体)
├─ HackerNews      (技术社区)
├─ Bing/Google     (搜索引擎)
├─ 微博            (国内热点)
├─ B站             (视频平台)
├─ 搜狗            (微信内容)
└─ DuckDuckGo      (隐私搜索)
```

## 🚀 快速开始

### 前置要求
- Node.js 18+
- npm 或 yarn
- OpenAI API Key (可选，但推荐)

### 1. 克隆项目并进入目录
```bash
cd g:\MyCode\AICode\ai-hot-news
```

### 2. 配置环境

复制配置文件模板：
```bash
copy config\config.example.json config\config.json
```

编辑 `config/config.json`，填写必需的API Key：
```json
{
  "ai": {
    "apiKey": "YOUR_OPENAI_API_KEY"
  },
  "datasources": {
    "twitter": {
      "apiKey": "YOUR_TWITTER_API_KEY"  // 可选
    }
  }
}
```

### 3. 前端开发环境

```bash
cd frontend
npm install
npm run dev
```
访问 http://localhost:3000

### 4. 后端开发环境

```bash
cd backend
npm install
npm run dev
```
后端服务运行在 http://localhost:3001

## 📁 项目结构

```
ai-hot-news/
├── frontend/              # React前端应用
│   ├── src/
│   │   ├── components/   # 可复用组件
│   │   ├── pages/        # 页面组件
│   │   ├── hooks/        # React钩子
│   │   ├── types/        # TS类型定义
│   │   ├── utils/        # 工具函数
│   │   ├── App.tsx       # 主应用
│   │   └── index.css     # 全局样式
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/               # Node.js后端服务
│   ├── src/
│   │   ├── routes/       # API路由
│   │   ├── services/     # 业务服务
│   │   ├── datasources/  # 数据源爬虫
│   │   ├── ai/           # AI识别引擎
│   │   ├── models/       # 数据模型
│   │   ├── utils/        # 工具函数
│   │   └── index.ts      # 应用入口
│   ├── package.json
│   └── tsconfig.json
│
├── config/                # 配置文件目录
│   ├── config.example.json  # 配置模板
│   └── README.md           # 配置文档
│
├── skills/                # Agent Skills
│   ├── hotspot-detection/ # 热点检测技能
│   ├── keyword-monitor/   # 关键词监控技能
│   └── content-verify/    # 内容验证技能
│
└── README.md             # 本文件
```

## 📋 开发計劃

### 阶段 1: ✅ 项目初始化 (已完成)
- [x] 创建项目结构
- [x] 初始化前端环境 (React + Vite + TypeScript)
- [x] 初始化后端环境 (Node.js + Express + TypeScript)
- [x] 配置文件模板创建
- [x] 基础UI框架搭建
- [x] 基础路由和API骨架

### 阶段 2: ✅ 前端完整开发 (已完成)
- [x] 完成所有页面组件 (NewsPage/MonitorPage/SettingsPage)
- [x] 集成API通信 (axios封装 + 全端点覆盖)
- [x] 支持SSE实时推送 (useSSE Hook)
- [x] 搜索、排序、收藏功能
- [x] 深色主题 + Aceternity UI设计体系
- [x] 单元测试 (vitest, 10/10通过)

### 阶段 3: 后端完整开发
- [ ] 数据库模型设计
- [ ] API接口完整实现
- [ ] 爬虫模块开发
  - [ ] Twitter API集成
  - [ ] HackerNews爬虫
  - [ ] Bing搜索爬虫
  - [ ] 微博爬虫
  - [ ] B站爬虫
  - [ ] 搜狗爬虫
  - [ ] Google爬虫
  - [ ] DuckDuckGo爬虫
- [ ] AI识别引擎集成
- [ ] 定时任务调度
- [ ] WebSocket推送服务

### 阶段 4: 集成与测试
- [ ] 前后端联调
- [ ] 功能测试
- [ ] 性能优化
- [ ] 错误处理完善

### 阶段 5: Agent Skills开发
- [ ] 热点检测Skill
- [ ] 关键词监控Skill
- [ ] 内容验证Skill
- [ ] Skills文档编写

## 🔌 数据源说明

| 数据源 | 类型 | 优先级 | 实现状态 | 说明 |
|--------|------|--------|---------|------|
| **Twitter** | API | P0 | ⏳ TODO | 社交媒体，实时性强 |
| **HackerNews** | API | P0 | ✅ 已实现 | 技术社区热点 |
| **Bing** | Web爬虫 | P1 | ⏳ TODO | 搜索引擎 |
| **Google** | Web爬虫 | P1 | ⏳ TODO | 全球最大搜索 |
| **微博** | Web爬虫 | P1 | ⏳ TODO | 国内热点主阵地 |
| **B站** | Web爬虫 | P2 | ⏳ TODO | 视频平台 |
| **搜狗** | Web爬虫 | P2 | ⏳ TODO | 微信公众号 |
| **DuckDuckGo** | Web爬虫 | P3 | ⏳ TODO | 隐私搜索 |

## 🤖 AI模块功能

### 热点识别 (Hotness Detection)
- 分析新闻标题和内容
- 判断是否属于真实的热点
- 返回热度评分 (0-100)

### 内容验证 (Content Verification)
- 检测虚假或伪造的内容
- 识别营销文案和夸大说法
- 返回真实性评分和警告

### 新闻摘要 (News Summarization)
- 将长文本浓缩为一句话
- 保留核心信息
- 支持多语言

## 🛠️ 技术栈

| 层 | 技术栈 | 版本 |
|----|--------|------|
| **前端** | React | 18.x |
| **前端工具** | Vite | 5.x |
| **前端样式** | Tailwind CSS | 3.x |
| **前端语言** | TypeScript | 5.x |
| **后端** | Node.js | 18+ |
| **后端框架** | Express | 4.x |
| **后端语言** | TypeScript | 5.x |
| **数据库** | SQLite | 3.x |
| **AI** | OpenAI | gpt-3.5-turbo |
| **爬虫** | Cheerio | 1.x |

## 📝 配置说明

### 基本配置 (config/config.json)

```json
{
  "server": {
    "port": 3001,
    "host": "localhost",
    "environment": "development"
  },
  "ai": {
    "apiKey": "YOUR_OPENAI_API_KEY",
    "apiUrl": "https://api.openai.com/v1",
    "model": "gpt-3.5-turbo"
  },
  "datasources": {
    "twitter": {
      "enabled": true,
      "apiKey": "YOUR_TWITTER_API_KEY"
    }
  }
}
```

### 环境变量

```bash
# .env 文件
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
