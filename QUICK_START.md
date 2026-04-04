# 快速开始指南

这份文档只回答一件事：如何尽快把系统跑起来并完成最基本的联调验证。系统级说明、模块说明和维护规则请回到 README.md。

## 前置条件

- Node.js 18+
- npm
- 可选的 OpenAI API Key
- Windows、macOS、Linux 均可运行

## 1. 准备配置

在项目根目录执行：

```bash
copy config\config.example.json config\config.json
```

至少检查这几个字段：

- ai.apiKey
- ai.lmStudio.enabled / ai.lmStudio.apiUrl / ai.lmStudio.model（如果你要走本地 LM Studio）
- datasources.twitter.apiKey（如需 Twitter）
- server.port
- security.cors.origin

如果暂时没有 OpenAI Key，系统仍可启动，但 AI 相关能力会退化为默认分值或跳过部分分析。
如果使用 LM Studio，本地服务默认地址通常是 http://localhost:1234/v1，apiKey 可先使用 lm-studio 这类占位值。

## 2. 启动后端

```bash
cd backend
npm install
npm run dev
```

成功标志：

- 控制台出现 Server running at http://localhost:3001
- 打开 http://localhost:3001/health 能返回状态 JSON

## 3. 启动前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

成功标志：

- Vite 启动成功
- 浏览器可访问 http://localhost:3000

## 4. 最小联调检查

启动成功后，按顺序检查：

1. 访问 http://localhost:3000，页面能正常加载。
2. 热点页能看到趋势卡片或空状态，不应是纯白页或接口报错页。
3. 关键词页可以新增一个测试关键词。
4. 设置页可以拉到当前数据源与 AI 配置。
5. 后端日志中没有连续的配置读取错误或数据库初始化错误。
6. 如怀疑 AI 配置异常，在 backend 目录运行 `npm run test:ai`，直接验证当前模型是否支持普通对话、json_object 和 json_schema。
7. 如启用了 LM Studio，确认 LM Studio 已加载目标模型，且设置页中的模型 ID 与 `/v1/models` 返回值一致。
8. 若当前 LM Studio 运行时不接受 `json_object`，但 `plain-chat`、`json-schema` 或 `structured-with-fallback` 正常，则主链路仍可用。
9. 如果要验证本地模型是否真的参与了综合报告生成，可调用 `/api/news/report`，并查看后端日志中打印的 provider、model、baseURL。

## 5. Windows 一键启动

项目根目录提供 start.bat，可在 Windows 下同时打开前后端两个终端窗口：

```bash
start.bat
```

注意：start.bat 只是便捷入口，排障时仍建议分别在 backend 和 frontend 目录手动启动。

## 常见问题

### 前端能打开，但接口 404 或网络错误

- 确认后端正在监听 3001
- 确认 frontend/vite.config.ts 中的 /api 代理目标仍是 http://localhost:3001
- 确认浏览器访问的是 3000 而不是其他 Vite 默认端口

### 后端启动失败

- 检查 config/config.json 是否存在且 JSON 合法
- 检查 data 和 logs 目录是否可写
- 检查 Node 版本是否低于 18

### 没有抓到热点

- 某些源依赖外部网络或第三方接口，先看后端日志里是超时、鉴权失败还是源站无结果
- 无 OpenAI Key 时，热度分析和摘要能力会退化，但不应阻塞基础采集

### 启用 LM Studio 后 AI 仍不可用

- 确认 LM Studio 已启动本地服务器，并监听在设置页填写的地址，默认是 http://localhost:1234/v1
- 确认设置页中的模型 ID 与 LM Studio 已加载模型完全一致
- 在 backend 目录运行 `npm run test:ai`，优先看 plain-chat 和 structured-with-fallback 两项是否通过
- 部分 LM Studio 运行时虽然提供 OpenAI-compatible 端点，但可能不接受 `response_format=json_object`；这类情况只要 `json_schema` 正常，就不一定影响当前项目
- 如果 `/api/news/report` 总是 fallback，优先检查 `config/config.json` 中的 `ai.timeout` 是否足够覆盖本地模型的响应时间

## 下一步阅读

- README.md：系统全貌与维护规则
- frontend/README.md：前端页面和交互实现
- backend/README.md：后端路由、调度与数据流
- config/README.md：配置项说明
