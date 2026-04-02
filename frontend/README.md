# AI热点新闻监控系统 - 前端开发文档

## 项目结构

```
frontend/
├── src/
│   ├── main.tsx              # 应用入口
│   ├── App.tsx               # 主应用组件 (Spotlight + FloatingDock)
│   ├── lib/
│   │   └── utils.ts          # cn() 工具函数 (clsx + tailwind-merge)
│   ├── pages/                # 页面组件
│   │   ├── NewsPage.tsx      # 热点新闻页 (BentoGrid + GlowingCard + 搜索/排序/收藏)
│   │   ├── MonitorPage.tsx   # 关键词监控页 (BackgroundGradient + AnimatePresence)
│   │   └── SettingsPage.tsx  # 设置页 (ToggleSwitch + GlowingCard)
│   ├── components/
│   │   └── ui/               # Aceternity UI 组件库
│   │       ├── spotlight.tsx           # SVG聚光灯效果
│   │       ├── text-generate-effect.tsx # 逐字文本揭示
│   │       ├── card-hover-effect.tsx    # 悬浮卡片网格
│   │       ├── meteors.tsx             # 流星雨背景
│   │       ├── background-gradient.tsx  # 动画渐变边框
│   │       ├── glowing-card.tsx        # 鼠标跟踪发光卡片
│   │       ├── animated-tabs.tsx       # 弹性标签导航
│   │       ├── bento-grid.tsx          # Bento统计网格
│   │       ├── floating-dock.tsx       # macOS浮动导航栏
│   │       ├── background-beams.tsx    # SVG光束线
│   │       ├── shimmer-button.tsx      # 微光按钮
│   │       └── moving-border.tsx       # 旋转渐变边框
│   ├── hooks/                # 自定义钩子
│   │   └── useSSE.ts         # SSE实时连接
│   ├── types/                # TypeScript类型定义
│   │   └── index.ts          # 全局类型
│   ├── utils/                # 工具函数
│   │   └── api.ts            # API封装
│   └── index.css             # 全局样式
├── index.html                # HTML模板
├── vite.config.ts            # Vite配置 (代理 -> :3001)
├── tailwind.config.js        # Tailwind CSS + Aceternity动画配置
├── postcss.config.js         # PostCSS配置
├── tsconfig.json             # TypeScript配置
└── package.json
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18 | UI框架 |
| TypeScript | 5 | 类型安全 |
| Vite | 5 | 构建工具 |
| Tailwind CSS | 3 | 原子化CSS |
| framer-motion | latest | 动画引擎 |
| clsx + tailwind-merge | latest | 类名合并 |
| @tabler/icons-react | latest | 图标库 |

## UI设计体系 - Aceternity UI

项目采用 **Aceternity UI** 设计风格，核心特征：
- **深色主题** - slate-950基底 + cyan/blue强调色
- **鼠标跟踪发光** - GlowingCard组件实现径向渐变跟随
- **弹性动画** - framer-motion spring物理动画
- **微光效果** - Shimmer/Spotlight等光效组件
- **渐变边框** - BackgroundGradient渐变边框包装器

### 主要配色
- **主背景** `bg-slate-950` (#020617)
- **卡片背景** `bg-slate-900/50` 半透明
- **强调色** `text-cyan-400` / `from-cyan-500 to-blue-600`
- **边框** `border-slate-800/60` 透明度边框
- **发光** `shadow-cyan-500/20` 青色光晕

### 动画系统 (tailwind.config.js)
- `shimmer` - 微光扫过效果
- `spotlight` - 聚光灯淡入
- `meteor` - 流星飞行
- `border-beam` - 边框光束旋转
- `slide-up/down` - 滑入滑出
- `fade-in` - 淡入
- `scale-in` - 缩放进入
- `glow` - 发光脉冲

## 启动开发

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```
访问 `http://localhost:3000`

### 编译构建
```bash
npm run build
```

### 类型检查
```bash
npm run type-check
```

## API集成

前端通过代理访问后端API：
- 代理配置：`vite.config.ts` 中的 `proxy` 字段
- API前缀：`/api`
- 后端服务：`http://localhost:3001`

### 示例请求
```typescript
// 获取热点新闻
const response = await fetch('/api/news?source=Twitter&limit=20')

// 添加关键词
const response = await fetch('/api/keywords', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: 'AI编程' })
})
```

| @testing-library/react | latest | 组件测试 |
| vitest | latest | 测试框架 |

## 测试

```bash
npm run test        # 运行测试
npm run test:watch  # 监听模式
```

### 测试覆盖
- NewsPage: 10个测试用例 (100% 通过)
  - 统计卡片渲染、新闻列表、排序、验证徽章、搜索、采集刷新、收藏、空状态、骨架屏、数据源筛选

## NewsPage 功能详解

热点新闻页是系统的核心页面，包含以下功能：

1. **BentoGrid 统计卡片** - 总热点数、活跃源、平均热度、我的收藏
2. **搜索功能** - 实时模糊搜索，调用后端 API 查询
3. **三种排序** - 🔥热度 | 🕐最新 | ✓已验证
4. **收藏/标记** - localStorage 持久化，支持仅显示收藏
5. **数据源筛选** - 动态胶囊按钮筛选不同源
6. **新闻卡片** - GlowingCard + 热度渐变条 + 验证徽章 + 可展开详情
7. **骨架屏** - 加载状态动画
8. **空状态** - Meteors背景 + 引导采集
9. **采集按钮** - ShimmerButton 触发后端爬取
