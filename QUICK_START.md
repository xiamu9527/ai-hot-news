# 快速开始指南

## 📋 前置条件

- Node.js 18+ 
- npm 或 yarn
- OpenAI API Key (获取: https://platform.openai.com/api-keys)

## 🚀 5分钟快速开始

### 1. 进入项目目录
```bash
cd g:\MyCode\AICode\ai-hot-news
```

### 2. 配置環境

#### Windows用户：
```bash
copy config\config.example.json config\config.json
```

#### Mac/Linux用户：
```bash
cp config/config.example.json config/config.json
```

### 3. 编辑配置文件

打开 `config/config.json`，填写必要的API Key:

```json
{
  "ai": {
    "apiKey": "YOUR_OPENAI_API_KEY"  // 替换为你的OpenAI Key
  },
  "datasources": {
    "twitter": {
      "apiKey": "YOUR_TWITTER_API_KEY"  // 可选
    }
  }
}
```

### 4. 启动后端服务

打开一个新的终端窗口：

```bash
cd backend
npm install
npm run dev
```

看到以下输出说明成功：
```
✅ Server running at http://localhost:3001
```

### 5. 启动前端应用

打开另一个新的终端窗口：

```bash
cd frontend
npm install
npm run dev
```

看到以下输出说明成功：
```
  ➜  Local:   http://localhost:3000/
```

### 6. 访问应用

在浏览器中打开 **http://localhost:3000**

你应该看到一个深色主题的热点新闻监控界面！

---

## 🎯 首次体验

### 添加监控关键词

1. 点击顶部导航的 "👁️ 关键词监控" 标签
2. 在输入框中输入关键词，比如 "AI编程"
3. 点击"添加"按钮
4. 状态会显示 "正在监控中..."

### 查看热点新闻

1. 点击 "📰 热点新闻" 标签
2. 系统会从多个数据源获取热点
3. 支持按数据源筛选
4. 每条新闻显示热度评分

### 配置系统

1. 点击 "⚙️ 设置" 标签
2. 选择要启用的数据源
3. 配置通知选项

---

## 📖 完整文档

- [项目README](./README.md) - 项目概览和功能说明
- [前端开发文档](./frontend/README.md) - 前端详细文档
- [后端开发文档](./backend/README.md) - 后端详细文档  
- [配置文档](./config/README.md) - 配置参数详解
- [完整开发计划](./DEVELOPMENT_PLAN.md) - 5阶段开发计划

---

## 🆘 常见问题

### Q: 浏览器打不开localhost:3000？
**A:** 确保前端开发服务器正在运行 (`npm run dev` 命令)，检查是否有错误输出。

### Q: API请求失败？
**A:** 检查后端服务是否启动，确保运行了 `cd backend && npm run dev`。

### Q: 无法获取热点新闻？
**A:** 
- 检查网络连接
- 确保配置文件中的API Key正确
- 查看后端日志是否有错误

### Q: OpenAI API返回错误？
**A:** 
- 检查API Key是否有效
- 检查账户余额是否充足
- 查看API调用限制

---

## 💡 下一步

1. ✅ **已完成**: 项目初始化和基础框架搭建
2. 🔜 **进行中**: 前端功能完整开发
3. 🔜 **等待**: 后端爬虫和AI集成
4. 🔜 **计划**: 黑箱测试和性能优化
5. 🔜 **计划**: Agent Skills开发

---

## 🤝 反馈与支持

遇到问题？有建议？随时告诉我！

---

**最后更新**: 2026-03-31
**项目状态**: 🚧 开发中 - 阶段1已完成
