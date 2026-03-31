# AI热点新闻监控系统 - 前端开发文档

## 项目结构

```
frontend/
├── src/
│   ├── main.tsx              # 应用入口
│   ├── App.tsx               # 主应用组件
│   ├── pages/                # 页面组件
│   ├── components/           # 可复用组件
│   ├── hooks/                # 自定义钩子
│   ├── types/                # TypeScript类型定义
│   ├── utils/                # 工具函数
│   └── index.css             # 全局样式
├── index.html                # HTML模板
├── vite.config.ts            # Vite配置
├── tailwind.config.js        # Tailwind CSS配置
├── postcss.config.js         # PostCSS配置
├── tsconfig.json             # TypeScript配置
└── package.json
```

## 主要页面

### 1. 热点新闻页面 (NewsTab)
- 展示来自各个数据源的热点新闻
- 支持按源筛选
- 卡片式设计，展示标题、摘要、热度
- 实时更新提醒

### 2. 关键词监控页面 (MonitorTab)
- 输入框添加监控关键词
- 列表展示所有监控中的关键词
- 支持删除关键词
- 显示关键词状态

### 3. 设置页面 (SettingsTab)
- 数据源启用/禁用切换
- 通知方式配置
- 其他系统设置

## 样式系统

### 深色主题颜色
- **主背景** `bg-slate-950` (#0f172a)
- **次背景** `bg-slate-900` / `bg-slate-800`
- **强调色** `text-cyan-400` / `bg-cyan-600`
- **边框** `border-slate-700` / `border-slate-800`

### 响应式设计
- 移动端优先
- 断点：`md` (768px), `lg` (1024px)
- 网格：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

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

## 界面特性

✨ **现代卡片设计**
- 圆角卡片容器
- 悬停效果动画
- 阴影和过渡效果

🎨 **深色主题**
- 护眼深色配色
- 高对比度文本
- 柔和的强调色

📱 **完全响应式**
- 移动设备优化
- 平板和桌面适配
- 灵活的网格布局

💫 **交互反馈**
- 按钮悬停效果
- 选项卡切换动画
- 平滑过渡效果
