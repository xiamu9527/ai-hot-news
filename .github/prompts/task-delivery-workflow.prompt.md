---
name: "任务交付工作流"
description: "执行项目任务时自动完成上下文阅读、最新官方资料检索、文档维护和 MCP 界面验证。适用于功能开发、UI 改造、重构和联调任务。"
argument-hint: "描述要执行的任务"
agent: "agent"
---

你正在 AI 热点新闻监控系统工作区中执行任务。

把这次工作视为完整交付，而不是单纯改代码。

## 必须执行的流程

### 1. 先建立上下文
除非这些文档已经在当前对话中阅读过且之后没有变化，否则先阅读：
- [README.md](../README.md)
- [QUICK_START.md](../QUICK_START.md)
- [frontend/README.md](../frontend/README.md)
- [backend/README.md](../backend/README.md)
- [config/README.md](../config/README.md)
- [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md)

然后继续阅读与当前任务直接相关的前端、后端、测试和配置文件。

### 2. 获取最新官方实现方式
在实现前，必须使用可用的 MCP 和官方文档工具获取当前 API、框架和集成方式，避免采用过时写法。

### 3. 直接执行任务
除非用户明确要求只分析，否则直接实现。
如果任务影响 UI，则使用ui-ux-pro-max技能，优先使用 Aceternity 风格和项目语言保持一致，且页面中不要添加emojis图标。

### 4. 同步维护文档
如果任务影响功能、结构、接口、配置、交互、测试流程或维护规则，必须更新对应文档：
- README.md
- QUICK_START.md
- frontend/README.md
- backend/README.md
- config/README.md
- DEVELOPMENT_PLAN.md

### 5. 验证结果
运行相关测试。
如果任务影响可见行为，必须用 Playwright 或 Chrome DevTools MCP 做真实浏览器验证。
测试结束后关闭测试浏览器或页面。

### 6. 清晰汇报结果
最终回复必须包含：
- 改了什么
- 更新了哪些文档
- 跑了哪些测试
- 测试结果如何
- 是否还有剩余风险或建议的下一步

## 当前任务

把本次对话里提供的任务描述作为当前要执行的任务。