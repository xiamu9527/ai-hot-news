import { OpenAI } from 'openai'
import { getConfig, Config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

export class AIEngine {
  private client: OpenAI
  private config: Config

  constructor() {
    this.config = getConfig()
    this.client = new OpenAI({
      apiKey: this.config.ai.apiKey,
      baseURL: this.config.ai.apiUrl,
      timeout: this.config.ai.timeout,
    })
  }

  /**
   * 检测热点新闻
   * 使用AI分析文章是否是真实的热点内容
   */
  async detectHotness(title: string, content: string): Promise<{
    isHotness: boolean
    score: number
    reasoning: string
  }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.ai.model,
        temperature: this.config.ai.temperature,
        max_tokens: this.config.ai.maxTokens,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的热点新闻分析师。你的任务是判断给定的新闻是否是AI领域的真实热点。
            
            需要考虑的因素：
            1. 新闻的创新性和影响力
            2. 是否涉及最新技术进展
            3. 是否可能是虚假或营销内容
            4. 对AI行业的实际意义
            
            返回格式：JSON
            {
              "isHotness": boolean,
              "score": number (0-100),
              "reasoning": "简短的分析理由"
            }`,
          },
          {
            role: 'user',
            content: `请分析这条新闻是否是热点：\n标题: ${title}\n内容: ${content}`,
          },
        ],
      })

      const content_text = response.choices[0].message.content || '{}'
      return JSON.parse(content_text)
    } catch (error) {
      logger.error('Error detecting hotness:', error)
      throw error
    }
  }

  /**
   * 验证新闻真实性
   * 检测是否是虚假或伪造的内容
   */
  async verifyContent(
    title: string,
    content: string,
    source: string,
  ): Promise<{
    verified: boolean
    confidence: number
    warnings: string[]
  }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.ai.model,
        temperature: this.config.ai.temperature,
        max_tokens: this.config.ai.maxTokens,
        messages: [
          {
            role: 'system',
            content: `你是一个内容真实性检测专家。你需要判断给定的内容是否可能是虚假、伪造或误导性的。

            需要检查的红旗：
            1. 夸大的说法（性能提升1000倍等）
            2. 时间不一致
            3. 已知的虚假信息
            4. 明显的营销文案
            5. 技术上不可能的宣称
            
            返回格式：JSON
            {
              "verified": boolean,
              "confidence": number (0-1),
              "warnings": ["warning1", "warning2"]
            }`,
          },
          {
            role: 'user',
            content: `请验证这条来自${source}的新闻真实性：\n标题: ${title}\n内容: ${content}`,
          },
        ],
      })

      const content_text = response.choices[0].message.content || '{}'
      return JSON.parse(content_text)
    } catch (error) {
      logger.error('Error verifying content:', error)
      throw error
    }
  }

  /**
   * 生成新闻摘要
   */
  async summarizeNews(content: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.ai.model,
        temperature: 0.5,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: '你是一个新闻编辑。请将给定的新闻浓缩为一句话，保留核心信息。',
          },
          {
            role: 'user',
            content: `请总结这条新闻：${content}`,
          },
        ],
      })

      return response.choices[0].message.content || content
    } catch (error) {
      logger.error('Error summarizing news:', error)
      throw error
    }
  }
}

export const aiEngine = new AIEngine()
