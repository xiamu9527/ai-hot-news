import { OpenAI } from 'openai'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

function extractJSON(text: string): string {
  // 尝试从 markdown code block 或纯文本中提取 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  // 尝试匹配 { } 或 [ ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) return jsonMatch[1]
  return text
}

// ============================================================
//  简单 LRU 缓存
// ============================================================
interface CacheEntry<T> { value: T; expiry: number }

class SimpleCache<T> {
  private map = new Map<string, CacheEntry<T>>()
  constructor(private maxSize: number = 200, private ttlMs: number = 10 * 60 * 1000) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiry) { this.map.delete(key); return undefined }
    return entry.value
  }

  set(key: string, value: T) {
    if (this.map.size >= this.maxSize) {
      // 删除最旧的条目
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { value, expiry: Date.now() + this.ttlMs })
  }
}

// ============================================================
//  带重试的 API 调用
// ============================================================
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelay = 1000): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const status = err?.status || err?.response?.status
      // 不对 400 / 401 / 403 等客户端错误重试
      if (status && status >= 400 && status < 500) throw err
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        logger.warn(`AI call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

export class AIEngine {
  private client: OpenAI
  private config: Config

  // 缓存：key 为内容的前128字符 hash
  private hotnessCache = new SimpleCache<{ isHotness: boolean; score: number; reasoning: string }>(200, 10 * 60 * 1000)
  private verifyCache = new SimpleCache<{ verified: boolean; confidence: number; warnings: string[] }>(200, 10 * 60 * 1000)
  private summaryCache = new SimpleCache<string>(300, 30 * 60 * 1000)

  constructor() {
    this.config = getConfig()
    this.client = new OpenAI({
      apiKey: this.config.ai.apiKey,
      baseURL: this.config.ai.apiUrl,
      timeout: this.config.ai.timeout,
    })
  }

  private cacheKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.map(p => p.slice(0, 128)).join('|')}`
  }

  /**
   * 检测热点新闻 - 使用AI分析文章是否是真实的热点内容
   */
  async detectHotness(title: string, content: string): Promise<{
    isHotness: boolean
    score: number
    reasoning: string
  }> {
    const key = this.cacheKey('hot', title, content)
    const cached = this.hotnessCache.get(key)
    if (cached) return cached

    try {
      const result = await withRetry(async () => {
        const response = await this.client.chat.completions.create({
          model: this.config.ai.model,
          temperature: this.config.ai.temperature,
          max_tokens: this.config.ai.maxTokens,
          messages: [
            {
              role: 'system',
              content: `你是专业的热点新闻分析师。判断给定新闻是否是真实热点。
考虑因素：1.创新性和影响力 2.是否涉及最新进展 3.是否虚假/营销内容 4.行业实际意义
只返回JSON，不要其他文字：{"isHotness":boolean,"score":number(0-100),"reasoning":"简短理由"}`,
            },
            {
              role: 'user',
              content: `分析这条新闻:\n标题: ${title}\n内容: ${content.slice(0, 500)}`,
            },
          ],
        })

        const raw = response.choices[0].message.content || '{}'
        const parsed = JSON.parse(extractJSON(raw))
        return {
          isHotness: !!parsed.isHotness,
          score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
          reasoning: String(parsed.reasoning || '')
        }
      })

      this.hotnessCache.set(key, result)
      return result
    } catch (error) {
      logger.error('Error detecting hotness:', error)
      return { isHotness: false, score: 20, reasoning: 'AI分析不可用' }
    }
  }

  /**
   * 验证新闻真实性 - 检测虚假或伪造的内容
   */
  async verifyContent(title: string, content: string, source: string): Promise<{
    verified: boolean
    confidence: number
    warnings: string[]
  }> {
    const key = this.cacheKey('verify', title, content)
    const cached = this.verifyCache.get(key)
    if (cached) return cached

    try {
      const result = await withRetry(async () => {
        const response = await this.client.chat.completions.create({
          model: this.config.ai.model,
          temperature: 0.3,
          max_tokens: this.config.ai.maxTokens,
          messages: [
            {
              role: 'system',
              content: `你是内容真实性检测专家。判断内容是否虚假、伪造或误导。
检查：1.夸大说法 2.时间不一致 3.已知虚假信息 4.明显营销 5.技术上不可能的宣称
只返回JSON：{"verified":boolean,"confidence":number(0-1),"warnings":["warning1"]}`,
            },
            {
              role: 'user',
              content: `验证来自${source}的新闻:\n标题: ${title}\n内容: ${content.slice(0, 500)}`,
            },
          ],
        })

        const raw = response.choices[0].message.content || '{}'
        const parsed = JSON.parse(extractJSON(raw))
        return {
          verified: !!parsed.verified,
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
        }
      })

      this.verifyCache.set(key, result)
      return result
    } catch (error) {
      logger.error('Error verifying content:', error)
      return { verified: true, confidence: 0.5, warnings: ['AI验证不可用，无法确认真实性'] }
    }
  }

  /**
   * 生成新闻摘要
   */
  async summarizeNews(content: string): Promise<string> {
    const key = this.cacheKey('sum', content)
    const cached = this.summaryCache.get(key)
    if (cached) return cached

    try {
      const result = await withRetry(async () => {
        const response = await this.client.chat.completions.create({
          model: this.config.ai.model,
          temperature: 0.5,
          max_tokens: 150,
          messages: [
            {
              role: 'system',
              content: '你是新闻编辑。将给定新闻浓缩为1-2句话的中文摘要，保留核心信息。',
            },
            {
              role: 'user',
              content: `总结这条新闻：${content.slice(0, 800)}`,
            },
          ],
        })
        return response.choices[0].message.content || content.slice(0, 200)
      })

      this.summaryCache.set(key, result)
      return result
    } catch (error) {
      logger.error('Error summarizing news:', error)
      return content.slice(0, 200)
    }
  }

  /**
   * 批量分析热点 - 用于域内热点发现
   */
  async analyzeTopics(domain: string, titles: string[]): Promise<Array<{
    title: string
    score: number
    category: string
  }>> {
    if (titles.length === 0) return []
    try {
      return await withRetry(async () => {
        const response = await this.client.chat.completions.create({
          model: this.config.ai.model,
          temperature: 0.5,
          max_tokens: 1000,
          messages: [
            {
              role: 'system',
              content: `你是"${domain}"领域的热点分析师。对以下新闻标题进行热度评分。
只返回JSON数组：[{"title":"原标题","score":0-100,"category":"分类"}]`,
            },
            {
              role: 'user',
              content: titles.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n'),
            },
          ],
        })

        const raw = response.choices[0].message.content || '[]'
        const parsed = JSON.parse(extractJSON(raw))
        return Array.isArray(parsed) ? parsed : []
      })
    } catch (error) {
      logger.error('Error analyzing topics:', error)
      return titles.map(t => ({ title: t, score: 30, category: domain }))
    }
  }
}

export const aiEngine = new AIEngine()
