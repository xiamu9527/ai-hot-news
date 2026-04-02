import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock OpenAI before importing AIEngine
vi.mock('openai', () => {
  const mockCreate = vi.fn()
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    constructor(_opts: any) {}
  }
  return { OpenAI: MockOpenAI }
})

vi.mock('../utils/config.js', () => ({
  getConfig: () => ({
    ai: {
      provider: 'test',
      apiKey: 'test-key',
      apiUrl: 'http://localhost:9999',
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 500,
      timeout: 10000,
    },
    datasources: {},
  }),
  loadConfig: vi.fn(),
  Config: {},
}))

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { AIEngine } = await import('../ai/engine.js')
const { OpenAI } = await import('openai')

describe('AIEngine', () => {
  let engine: InstanceType<typeof AIEngine>
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    engine = new AIEngine()
    mockCreate = (engine as any).client.chat.completions.create
    mockCreate.mockReset()
  })

  describe('detectHotness', () => {
    it('应正确解析 AI 返回的热度结果', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"isHotness": true, "score": 85, "reasoning": "重大技术突破"}' },
        }],
      })

      const result = await engine.detectHotness('AI 新突破', 'OpenAI 发布 GPT-5...')
      expect(result.isHotness).toBe(true)
      expect(result.score).toBe(85)
      expect(result.reasoning).toBe('重大技术突破')
    })

    it('score 应被限制在 0-100 范围内', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"isHotness": true, "score": 150, "reasoning": "test"}' },
        }],
      })

      const result = await engine.detectHotness('test', 'test')
      expect(result.score).toBe(100)
    })

    it('AI 调用失败时应降级返回默认值', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'))

      const result = await engine.detectHotness('test', 'test')
      expect(result.isHotness).toBe(false)
      expect(result.score).toBe(20)
      expect(result.reasoning).toBe('AI分析不可用')
    })

    it('应使用缓存避免重复调用', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '{"isHotness": true, "score": 70, "reasoning": "cached"}' } }],
      })

      await engine.detectHotness('Same Title', 'Same Content')
      await engine.detectHotness('Same Title', 'Same Content')

      // 第二次调用应走缓存，只有一次 API 调用
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('应能解析 markdown code block 包裹的 JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '```json\n{"isHotness": false, "score": 30, "reasoning": "普通新闻"}\n```' },
        }],
      })

      const result = await engine.detectHotness('test', 'test content')
      expect(result.isHotness).toBe(false)
      expect(result.score).toBe(30)
    })
  })

  describe('verifyContent', () => {
    it('应正确解析验证结果', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"verified": true, "confidence": 0.9, "warnings": []}' },
        }],
      })

      const result = await engine.verifyContent('Test', 'Content...', 'Bing')
      expect(result.verified).toBe(true)
      expect(result.confidence).toBe(0.9)
      expect(result.warnings).toEqual([])
    })

    it('应返回警告信息', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"verified": false, "confidence": 0.3, "warnings": ["夸大其词", "可能营销"]}' },
        }],
      })

      const result = await engine.verifyContent('夸张标题!!!', '...', 'Unknown')
      expect(result.verified).toBe(false)
      expect(result.warnings).toHaveLength(2)
    })

    it('API 失败时应降级返回', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const result = await engine.verifyContent('test', 'test', 'Bing')
      expect(result.verified).toBe(true) // 降级为信任
      expect(result.confidence).toBe(0.5)
    })
  })

  describe('summarizeNews', () => {
    it('应返回 AI 生成的摘要', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'OpenAI发布了GPT-5模型，在推理能力上取得重大突破。' } }],
      })

      const result = await engine.summarizeNews('OpenAI today announced GPT-5, ...(very long content)')
      expect(result).toBe('OpenAI发布了GPT-5模型，在推理能力上取得重大突破。')
    })

    it('AI 失败时应降级为截断文本', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const longContent = 'A'.repeat(500)
      const result = await engine.summarizeNews(longContent)
      expect(result).toHaveLength(200)
    })
  })

  describe('analyzeTopics', () => {
    it('应返回批量分析结果', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '[{"title":"AI突破","score":90,"category":"技术"},{"title":"天气预报","score":20,"category":"生活"}]',
          },
        }],
      })

      const result = await engine.analyzeTopics('综合', ['AI突破', '天气预报'])
      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(90)
    })

    it('空标题列表应返回空数组', async () => {
      const result = await engine.analyzeTopics('test', [])
      expect(result).toEqual([])
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('AI 失败时应返回默认评分', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const result = await engine.analyzeTopics('tech', ['Title 1', 'Title 2'])
      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(30) // 默认评分
    })
  })
})
