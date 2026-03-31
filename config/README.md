# 配置文件说明

## 快速开始

1. 复制 `config.example.json` 为 `config.json`
2. 填写必要的API Key: 
   - `ai.apiKey`: OpenAI API Key
   - `datasources.twitter.apiKey`: Twitter API Key (可选)
3. 根据需要启用/禁用数据源

## 配置项详解

### 数据源 (datasources)

| 源 | 类型 | 是否需要Key | 说明 |
|----|------|-----------|------|
| Twitter | API | 是 | 社交媒体实时热点 |
| HackerNews | API | 否 | 技术社区 |
| Bing | Web爬虫 | 否 | 搜索引擎 |
| Google | Web爬虫 | 否 | 搜索引擎 |
| DuckDuckGo | Web爬虫 | 否 | 隐私搜索 |
| 微博 | Web爬虫 | 否 | 国内热点 |
| B站 | Web爬虫 | 否 | 视频平台 |
| 搜狗 | Web爬虫 | 否 | 微信公众号内容 |

### AI配置

- `provider`: 目前支持 openai, azure, custom
- `model`: 推荐 gpt-3.5-turbo (成本低，速度快)
- `temperature`: 0-1, 越高越创意，推荐0.7

### 爬虫配置

- `rateLimiting`: 频率限制，避免被封IP
- `userAgent`: 浏览器标识
- `timeout`: 单次请求超时时间

## 环境变量支持

可通过环境变量覆盖配置:

```bash
export OPENAI_API_KEY="sk-xxx"
export TWITTER_API_KEY="xxx"
export APP_PORT=3001
```
