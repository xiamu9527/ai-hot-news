# 配置文档

这份文档只解释配置结构和维护约定。系统能力和模块说明请看根目录 README.md。

## 配置文件位置

- 模板：config/config.example.json
- 实际运行：config/config.json
- 允许通过 CONFIG_PATH 指向其他配置文件

## 最小配置步骤

1. 复制模板为 config.json
2. 检查 server.port 和 server.host
3. 按需填写 ai.apiKey
4. 按需启用或关闭 datasources 中的源
5. 启动后端验证配置是否被正确读取

## 配置结构概览

### server

- port：后端端口，默认 3001
- host：监听地址，默认 localhost
- environment：运行环境标记

### database

- type：当前为 sqlite
- path：数据库文件路径

### api

- baseUrl：后端基础地址
- timeout：接口超时

### datasources

当前模板中已列出这些源：

- twitter
- hackerNews
- bing
- google
- duckduckgo
- weibo
- bili
- sogou
- baidu
- zhihu
- toutiao
- news36kr
- ithome
- huxiu
- douyin
- thepaper
- juejin
- sspai
- v2ex
- douban
- tieba
- hupu
- ifeng
- github
- solidot
- wallstreetcn
- linuxdo
- freebuf
- nowcoder

常见字段：

- enabled：是否启用
- apiKey：需要鉴权的源使用
- apiUrl / searchUrl / rssUrl：源地址
- refreshInterval：抓取周期建议值
- limit：单轮抓取上限

说明：配置里出现并不代表 crawler 已完整接入。新增或删除源时，必须同步核对 crawler.ts 与 README.md。

### ai

- provider：openai / azure / custom
- apiKey：主模型密钥
- apiUrl：模型服务地址
- model：当前模型名
- temperature：采样温度
- maxTokens：单次响应 token 上限
- timeout：请求超时

### ai.lmStudio

- enabled：是否优先使用本地 LM Studio OpenAI 兼容接口
- apiUrl：本地服务地址，LM Studio 官方默认是 http://localhost:1234/v1
- apiKey：本地兼容接口占位 Key，可使用 lm-studio
- model：LM Studio 已加载模型的 ID，需与 `/v1/models` 返回值一致

说明：当 enabled 为 true 时，后端启动时会把运行时实际使用的 provider、apiUrl、apiKey 和 model 切到 ai.lmStudio 配置；原 ai 块中的云端值仍会保留，便于关闭后切回。
补充：部分 LM Studio 运行时虽提供 OpenAI-compatible 接口，但对 `response_format` 的支持并不完全等同于 OpenAI；当前项目主链路以 chat completion 和 json_schema 为主。

### aiAlternatives

用于保留 Azure 或自定义模型的备用配置。若业务逻辑真正开始切换备用模型，必须同步更新 README.md 与 backend/README.md。

### notifications

- enabled：通知总开关
- types：通知类型列表
- web.enabled：Web 通知是否启用
- web.useWebSocket：当前前端配置项，现有实现仍以 SSE 为主

### crawler

- userAgent：抓取请求头
- timeout：单请求超时
- retries：重试次数
- proxy：代理配置
- rateLimiting：频率限制

### logging

- level：日志级别
- format：日志格式
- file：日志文件路径

### security

- cors.origin：允许的前端来源
- rateLimit.windowMs：限流时间窗
- rateLimit.maxRequests：最大请求数

### scheduler

- enabled：是否启用自动采集调度，默认 false
- intervalHours：自动采集间隔（小时），默认 6

说明：enabled 为 false 时后端启动不会自动运行热点采集和关键词监控的定时任务。开启后按 intervalHours 设定的周期执行，且仅采集当天新闻。可通过前端设置页或直接编辑 config.json 修改。

## 配置维护规则

1. 任何新增配置项都要同时更新 config.example.json 和本文件。
2. 任何会被前端设置页读写的配置项，都要同步核对 backend/src/routes/settings.ts。
3. 若默认值变化会影响启动端口、CORS 或可用数据源，README.md 和 QUICK_START.md 也必须一起更新。
4. 配置文档只写字段语义和维护约束，不写业务流程。
