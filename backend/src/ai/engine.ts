import { OpenAI } from 'openai'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function extractJSON(text: string): string {
  // 尝试从 markdown code block 或纯文本中提取 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  // 尝试匹配 { } 或 [ ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) return jsonMatch[1]
  return text
}

function shouldFallbackToJsonMode(error: any): boolean {
  const status = error?.status || error?.response?.status
  const message = String(error?.message || '')
  if (status === 400) return true
  return /(response_format|json_schema|structured output|not supported|unsupported)/i.test(message)
}

function isQuotaExhaustedError(error: any): boolean {
  const status = error?.status || error?.response?.status
  const message = String(error?.message || error?.response?.data?.error?.message || '')
  return status === 403 && /(free tier|exhausted|quota|额度|余额|insufficient)/i.test(message)
}

function ensureJsonInstruction(messages: ChatMessage[]): ChatMessage[] {
  const hasJsonHint = messages.some((message) => /json/i.test(message.content))
  if (hasJsonHint) return messages

  return messages.map((message, index) => {
    if (index !== 0) return message
    return {
      ...message,
      content: `${message.content}\n请严格返回 JSON 对象（json），不要输出额外说明。`,
    }
  })
}

function prefersJsonObjectMode(config: Config): boolean {
  const provider = String(config.ai.provider || '').toLowerCase()
  const apiUrl = String(config.ai.apiUrl || '').toLowerCase()
  return provider === 'bailian' || provider === 'dashscope' || apiUrl.includes('dashscope.aliyuncs.com')
}

function prefersTextJsonFallback(config: Config): boolean {
  const provider = String(config.ai.provider || '').toLowerCase()
  const apiUrl = String(config.ai.apiUrl || '').toLowerCase()
  return provider === 'lmstudio' || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')
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

  private normalizeImportanceLevel(raw?: string): 'urgent' | 'high' | 'medium' | 'low' {
    const value = raw?.trim().toLowerCase()
    if (value === 'urgent' || value === 'high' || value === 'medium' || value === 'low') {
      return value
    }
    return 'medium'
  }

  private async createStructuredCompletion<T>(options: {
    schemaName: string
    schema: Record<string, unknown>
    messages: ChatMessage[]
    maxTokens: number
    temperature: number
    fallback: T
  }): Promise<T> {
    const useJsonObjectFirst = prefersJsonObjectMode(this.config)
    const useTextJsonFallback = prefersTextJsonFallback(this.config)
    const requestBase = {
      model: this.config.ai.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: useJsonObjectFirst ? ensureJsonInstruction(options.messages) : options.messages,
    }

    if (useJsonObjectFirst) {
      const jsonResponse = await this.client.chat.completions.create({
        ...requestBase,
        response_format: { type: 'json_object' },
      } as any)

      const raw = jsonResponse.choices[0].message.content || JSON.stringify(options.fallback)
      return JSON.parse(extractJSON(raw)) as T
    }

    try {
      const structuredResponse = await this.client.chat.completions.create({
        ...requestBase,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
      } as any)

      const raw = structuredResponse.choices[0].message.content || JSON.stringify(options.fallback)
      return JSON.parse(extractJSON(raw)) as T
    } catch (error) {
      if (!shouldFallbackToJsonMode(error)) throw error

      logger.warn(`Structured output unavailable for ${options.schemaName}, falling back to ${useTextJsonFallback ? 'text JSON' : 'JSON object'} mode`)
      const fallbackResponse = await this.client.chat.completions.create(
        useTextJsonFallback
          ? {
              ...requestBase,
              messages: ensureJsonInstruction(options.messages),
            } as any
          : {
              ...requestBase,
              messages: ensureJsonInstruction(options.messages),
              response_format: { type: 'json_object' },
            } as any
      )

      const raw = fallbackResponse.choices[0].message.content || JSON.stringify(options.fallback)
      return JSON.parse(extractJSON(raw)) as T
    }
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
        const parsed = await this.createStructuredCompletion<{
          isHotness: boolean
          score: number
          reasoning: string
        }>({
          schemaName: 'hotness_analysis',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['isHotness', 'score', 'reasoning'],
            properties: {
              isHotness: { type: 'boolean' },
              score: { type: 'number' },
              reasoning: { type: 'string' },
            },
          },
          temperature: this.config.ai.temperature,
          maxTokens: this.config.ai.maxTokens,
          fallback: { isHotness: false, score: 0, reasoning: '' },
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
    verified: boolean | null
    confidence: number
    warnings: string[]
  }> {
    const key = this.cacheKey('verify', title, content)
    const cached = this.verifyCache.get(key)
    if (cached) return cached

    try {
      const result = await withRetry(async () => {
        const parsed = await this.createStructuredCompletion<{
          verified: boolean
          confidence: number
          warnings: string[]
        }>({
          schemaName: 'content_verification',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['verified', 'confidence', 'warnings'],
            properties: {
              verified: { type: 'boolean' },
              confidence: { type: 'number' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
          temperature: 0.3,
          maxTokens: this.config.ai.maxTokens,
          fallback: { verified: false, confidence: 0, warnings: [] },
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
      return { verified: null, confidence: 0, warnings: ['AI验证不可用，无法确认真实性'] }
    }
  }

  /**
   * 生成新闻摘要内容，并将外语翻译为中文
   */
  async summarizeNews(title: string, content: string): Promise<{ title: string, summary: string }> {
    const key = this.cacheKey('sum_trans', title, content)
    const cached = this.summaryCache.get(key)
    if (cached) {
      try { return JSON.parse(cached) } catch { /* ignore */ }
    }

    try {
      const result = await withRetry(async () => {
        const parsed = await this.createStructuredCompletion<{ title: string; summary: string }>({
          schemaName: 'news_summary_translation',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'summary'],
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
            },
          },
          temperature: 0.5,
          maxTokens: 250,
          fallback: { title, summary: content.slice(0, 200) },
          messages: [
            {
              role: 'system',
              content: '你是一个专业的新闻翻译与编辑专家。请将给定的新闻标题和内容翻译为地道的中文。如果原文本来就是中文，则直接进行优化总结。此外，将详细新闻浓缩为1-2句话的中文摘要。请严格以 JSON 格式返回，包含字段："title"（中文标题）和 "summary"（中文摘要）。不要返回其他文字。',
            },
            {
              role: 'user',
              content: `标题：${title}\n内容：${content.slice(0, 800)}`,
            },
          ],
        })

        return {
          title: parsed.title || title,
          summary: parsed.summary || content.slice(0, 200)
        }
      })

      this.summaryCache.set(key, JSON.stringify(result))
      return result
    } catch (error) {
      logger.error('Error summarizing news:', error)
      return { title, summary: content.slice(0, 200) }
    }
  }

  /**
   * 语义扩展关键词，衍生出3-5个高频同义或相关搜索词
   */
  async expandKeyword(keyword: string): Promise<string[]> {
    const key = this.cacheKey('expand', keyword)
    // 借用 summaryCache 作为通用缓存
    const cached = this.summaryCache.get(key)
    if (cached) return JSON.parse(cached)

    try {
      const result = await withRetry(async () => {
        const parsed = await this.createStructuredCompletion<string[]>({
          schemaName: 'keyword_expansion',
          schema: {
            type: 'array',
            items: { type: 'string' },
          },
          temperature: 0.6,
          maxTokens: 150,
          fallback: [keyword],
          messages: [
            {
              role: 'system',
              content: '你是一个专业的搜索引擎优化和监控专家。根据用户提供的关键词，提取并衍生出与其语义相关、更易命中的3到5个高频搜索词（包括同义词、英文缩写或行业术语）。只需返回一个合法的 JSON 字符串数组，如: ["词1", "词2", "词3"]，不需要任何其他解释。',
            },
            {
              role: 'user',
              content: `请为这个关键词生成扩展搜索词：${keyword}`,
            },
          ],
        })

        // 确保原始关键词也在里面
        if (!parsed.includes(keyword)) {
          parsed.unshift(keyword)
        }
        
        return parsed.slice(0, 5)
      })

      this.summaryCache.set(key, JSON.stringify(result))
      return result
    } catch (error) {
      logger.error('Error expanding keyword:', error)
      return [keyword]
    }
  }

  /**
   * 批量分析热点 - 用于域内热点发现
   */
  async analyzeTopics(domain: string, titles: string[]): Promise<Array<{
    title: string
    score: number
    category: string
    reasoning: string
  }>> {
    if (titles.length === 0) return []
    try {
      return await withRetry(async () => {
        const parsed = await this.createStructuredCompletion<Array<{
          title: string
          score: number
          category: string
          reasoning: string
        }>>({
          schemaName: 'topic_analysis',
          schema: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'score', 'category', 'reasoning'],
              properties: {
                title: { type: 'string' },
                score: { type: 'number' },
                category: { type: 'string' },
                reasoning: { type: 'string' },
              },
            },
          },
          temperature: 0.5,
          maxTokens: 1000,
          fallback: [],
          messages: [
            {
              role: 'system',
              content: `你是"${domain}"领域的热点分析师。对以下新闻标题进行热度评分，并说明其成为热点的关联原因。
只返回JSON数组：[{"title":"原标题","score":0-100,"category":"分类","reasoning":"一句话原因"}]`,
            },
            {
              role: 'user',
              content: titles.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n'),
            },
          ],
        })
        return Array.isArray(parsed)
          ? parsed.map((item) => ({
              title: String(item?.title || ''),
              score: Math.min(100, Math.max(0, Number(item?.score) || 0)),
              category: String(item?.category || domain),
              reasoning: String(item?.reasoning || ''),
            }))
          : []
      })
    } catch (error) {
      logger.error('Error analyzing topics:', error)
      return titles.map(t => ({
        title: t,
        score: 30,
        category: domain,
        reasoning: 'AI批量分析不可用，暂以默认热度展示'
      }))
    }
  }

  async analyzeNewsBatch(
    domain: string,
    items: Array<{
      id: string
      title: string
      source: string
      summary: string
      publishedAt?: string | null
    }>
  ): Promise<Array<{
    id: string
    score: number
    category: string
    reasoning: string
    importance: 'urgent' | 'high' | 'medium' | 'low'
    isHotness: boolean
    riskFlag: boolean
  }>> {
    if (items.length === 0) return []

    try {
      return await withRetry(async () => {
        const parsed = await this.createStructuredCompletion<Array<{
          id: string
          score: number
          category: string
          reasoning: string
          importance: string
          isHotness: boolean
          riskFlag: boolean
        }>>({
          schemaName: 'news_batch_analysis',
          schema: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'score', 'category', 'reasoning', 'importance', 'isHotness', 'riskFlag'],
              properties: {
                id: { type: 'string' },
                score: { type: 'number' },
                category: { type: 'string' },
                reasoning: { type: 'string' },
                importance: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
                isHotness: { type: 'boolean' },
                riskFlag: { type: 'boolean' },
              },
            },
          },
          temperature: 0.3,
          maxTokens: 1400,
          fallback: [],
          messages: [
            {
              role: 'system',
              content: `你是"${domain}"领域的热点分析师。你会收到一组新闻压缩摘要，请对每条内容独立判断，不要相互覆盖。
输出必须是 JSON 数组，每个对象严格包含这些字段：
{"id":"输入中的id","score":0-100,"category":"分类","reasoning":"一句话理由","importance":"urgent|high|medium|low","isHotness":true,"riskFlag":false}
要求：
1. id 必须和输入一致。
2. score 表示热点强度。
3. importance 表示处置优先级。
4. riskFlag 用于标记疑似营销、陈旧旧闻、标题党、低信息量内容。`,
            },
            {
              role: 'user',
              content: items.map((item) => {
                const publishedAt = item.publishedAt ? `发布时间: ${item.publishedAt}` : '发布时间: 未知'
                return [
                  `id: ${item.id}`,
                  `标题: ${item.title}`,
                  `来源: ${item.source}`,
                  publishedAt,
                  `摘要: ${item.summary}`,
                ].join('\n')
              }).join('\n\n---\n\n'),
            },
          ],
        })

        return Array.isArray(parsed)
          ? parsed
              .map((item) => ({
                id: String(item?.id || ''),
                score: Math.min(100, Math.max(0, Number(item?.score) || 0)),
                category: String(item?.category || domain),
                reasoning: String(item?.reasoning || ''),
                importance: this.normalizeImportanceLevel(String(item?.importance || 'medium')),
                isHotness: Boolean(item?.isHotness),
                riskFlag: Boolean(item?.riskFlag),
              }))
              .filter((item) => item.id)
          : []
      })
    } catch (error) {
      logger.error('Error analyzing news batch:', error)
      return items.map((item) => ({
        id: item.id,
        score: 30,
        category: domain,
        reasoning: 'AI批量分析不可用，暂以默认热度展示',
        importance: 'medium',
        isHotness: false,
        riskFlag: false,
      }))
    }
  }

  async generateNewsReport(
    mode: 'matched' | 'hotspots',
    items: Array<{
      id: number
      title: string
      source: string
      summary: string
      hotness: number
      aiAnalysis?: string
    }>
  ): Promise<{
    headline: string
    summary: string
    keyFindings: string[]
    riskAlerts: string[]
    recommendedActions: string[]
    stockMarketImpact: string[]
  }> {
    if (items.length === 0) {
      return {
        headline: mode === 'matched' ? '暂无命中分析' : '暂无热点探索报告',
        summary: '当前没有足够的新闻数据生成综合报告。',
        keyFindings: [],
        riskAlerts: [],
        recommendedActions: [],
        stockMarketImpact: [],
      }
    }

    try {
      logger.info(`Generating news report via provider=${this.config.ai.provider}, model=${this.config.ai.model}, baseURL=${this.config.ai.apiUrl}, items=${items.length}`)
      const parsed = await withRetry(async () => {
        return await this.createStructuredCompletion<{
          headline: string
          summary: string
          keyFindings: string[]
          riskAlerts: string[]
          recommendedActions: string[]
          stockMarketImpact: string[]
        }>({
          schemaName: 'news_report',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['headline', 'summary', 'keyFindings', 'riskAlerts', 'recommendedActions', 'stockMarketImpact'],
            properties: {
              headline: { type: 'string' },
              summary: { type: 'string' },
              keyFindings: { type: 'array', items: { type: 'string' } },
              riskAlerts: { type: 'array', items: { type: 'string' } },
              recommendedActions: { type: 'array', items: { type: 'string' } },
              stockMarketImpact: { type: 'array', items: { type: 'string' } },
            },
          },
          temperature: 0.4,
          maxTokens: 1200,
          fallback: {
            headline: mode === 'matched' ? '命中分析综合报告' : '热点探索综合报告',
            summary: 'AI 综合报告暂不可用。',
            keyFindings: [],
            riskAlerts: [],
            recommendedActions: [],
            stockMarketImpact: [],
          },
          messages: [
            {
              role: 'system',
              content: mode === 'matched'
                ? '你是情报分析师，请针对关键词命中的新闻生成综合报告。重点提炼命中主题、共同趋势、潜在风险、下一步动作建议，以及对股市可能产生的影响（包括可能受影响的行业板块、个股方向、市场情绪变化等）。'
                : '你是热点情报分析师，请针对多来源热点生成综合报告。重点提炼全网趋势、跨源共振、风险点、下一步观察建议，以及对股市可能产生的影响（包括可能受影响的行业板块、个股方向、市场情绪变化等）。',
            },
            {
              role: 'user',
              content: items.slice(0, 10).map((item, index) => [
                `${index + 1}. 标题: ${item.title}`,
                `来源: ${item.source}`,
                `热度: ${item.hotness}`,
                `摘要: ${item.summary}`,
                `AI解析: ${item.aiAnalysis || '无'}`,
              ].join('\n')).join('\n\n---\n\n'),
            },
          ],
        })
      })

      return {
        headline: parsed.headline,
        summary: parsed.summary,
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
        riskAlerts: Array.isArray(parsed.riskAlerts) ? parsed.riskAlerts : [],
        recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
        stockMarketImpact: Array.isArray(parsed.stockMarketImpact) ? parsed.stockMarketImpact : [],
      }
    } catch (error) {
      logger.error('Error generating news report:', error)
      const quotaExhausted = isQuotaExhaustedError(error)
      return {
        headline: mode === 'matched' ? '命中分析综合报告' : '热点探索综合报告',
        summary: quotaExhausted
          ? 'AI 额度已用尽，当前先展示基础结果。请补充模型额度后再生成综合报告。'
          : 'AI 综合报告暂不可用。',
        keyFindings: [],
        riskAlerts: [],
        recommendedActions: [],
        stockMarketImpact: [],
      }
    }
  }
}

export const aiEngine = new AIEngine()
