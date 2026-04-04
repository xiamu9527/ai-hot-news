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

    it('应优先使用 json_schema 结构化输出', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"isHotness": true, "score": 80, "reasoning": "结构化返回"}' },
        }],
      })

      await engine.detectHotness('schema test', 'schema content')

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      }))
    })

    it('bailian 提供方应默认使用 json_object', async () => {
      vi.resetModules()
      vi.doMock('../utils/config.js', () => ({
        getConfig: () => ({
          ai: {
            provider: 'bailian',
            apiKey: 'test-key',
            apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: 'qwen-test',
            temperature: 0.7,
            maxTokens: 500,
            timeout: 10000,
          },
          datasources: {},
        }),
        loadConfig: vi.fn(),
        Config: {},
      }))

      const { AIEngine: BailianEngine } = await import('../ai/engine.js')
      const bailianEngine = new BailianEngine()
      const bailianCreate = (bailianEngine as any).client.chat.completions.create
      bailianCreate.mockReset()
      bailianCreate.mockResolvedValueOnce({
        choices: [{
          message: { content: '{"isHotness":true,"score":75,"reasoning":"兼容模式返回"}' },
        }],
      })

      await bailianEngine.detectHotness('schema test', 'schema content')

      expect(bailianCreate).toHaveBeenCalledWith(expect.objectContaining({
        response_format: { type: 'json_object' },
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringMatching(/json/i) }),
        ]),
      }))

      vi.resetModules()
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
      expect(result.verified).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.warnings).toContain('AI验证不可用，无法确认真实性')
    })
  })

  describe('summarizeNews', () => {
    it('应返回 AI 生成的翻译及中文摘要', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"title":"GPT-5发布", "summary":"OpenAI发布了GPT-5模型，在推理能力上取得重大突破。"}' } }],
      })

      const result = await engine.summarizeNews('New GPT-5', 'OpenAI today announced GPT-5, ...(very long content)')
      expect(result.title).toBe('GPT-5发布')
      expect(result.summary).toBe('OpenAI发布了GPT-5模型，在推理能力上取得重大突破。')
    })

    it('AI 失败时应降级为截断文本', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const longContent = 'A'.repeat(500)
      const result = await engine.summarizeNews('Tit', longContent)
      expect(result.title).toBe('Tit')
      expect(result.summary).toHaveLength(200)
    })
  })

  describe('expandKeyword', () => {
    it('应返回 AI 生成的语义拓展变体', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '["GPT-5", "大模型", "ChatGPT-5"]' } }],
      })

      const result = await engine.expandKeyword('GPT-5')
      expect(result).toEqual(['GPT-5', '大模型', 'ChatGPT-5'])
    })

    it('如果原始词不在变体中，应自动补充到第一位', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '["大模型", "ChatGPT-5"]' } }],
      })

      const result = await engine.expandKeyword('GPT-5')
      expect(result).toEqual(['GPT-5', '大模型', 'ChatGPT-5'])
    })

    it('AI 失败时应保底返回原始关键词', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const result = await engine.expandKeyword('test-fail')
      expect(result).toEqual(['test-fail'])
    })
  })

  describe('analyzeTopics', () => {
    it('应返回批量分析结果', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '[{"title":"AI突破","score":90,"category":"技术","reasoning":"技术突破带来行业关注"},{"title":"天气预报","score":20,"category":"生活","reasoning":"常规信息，话题性弱"}]',
          },
        }],
      })

      const result = await engine.analyzeTopics('综合', ['AI突破', '天气预报'])
      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(90)
      expect(result[0].reasoning).toBe('技术突破带来行业关注')
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
      expect(result[0].reasoning).toBe('AI批量分析不可用，暂以默认热度展示')
    })
  })

  describe('analyzeNewsBatch', () => {
    it('应返回按 id 对齐的批量判断结果', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '[{"id":"101","score":88,"category":"AI","reasoning":"行业关注度高","importance":"high","isHotness":true,"riskFlag":false}]',
          },
        }],
      })

      const result = await engine.analyzeNewsBatch('综合热点', [
        { id: '101', title: 'AI 新模型发布', source: 'Bing', summary: '模型能力提升明显', publishedAt: '2026-04-04T00:00:00Z' },
      ])

      expect(result).toEqual([
        {
          id: '101',
          score: 88,
          category: 'AI',
          reasoning: '行业关注度高',
          importance: 'high',
          isHotness: true,
          riskFlag: false,
        },
      ])
    })

    it('AI 失败时应按输入 id 返回默认结果', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const result = await engine.analyzeNewsBatch('综合热点', [
        { id: '101', title: 'AI 新模型发布', source: 'Bing', summary: '模型能力提升明显', publishedAt: null },
        { id: '102', title: '旧闻转发', source: '微博', summary: '重复传播内容', publishedAt: null },
      ])

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('101')
      expect(result[0].score).toBe(30)
      expect(result[1].id).toBe('102')
      expect(result[1].importance).toBe('medium')
    })
  })

  describe('generateNewsReport', () => {
    it('AI 失败时应返回可展示的保底综合报告', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))

      const result = await engine.generateNewsReport('matched', [
        {
          id: 1,
          title: '命中新闻',
          source: 'Bing',
          summary: '摘要内容',
          hotness: 80,
          aiAnalysis: '{"reasoning":"测试"}',
        },
      ])

      expect(result.headline).toBe('命中分析综合报告')
      expect(result.summary).toBe('AI 综合报告暂不可用。')
      expect(result.keyFindings).toEqual([])
    })

    it('额度耗尽时应返回明确提示', async () => {
      const error = new Error('403 The free tier of the model has been exhausted.') as Error & { status?: number }
      error.status = 403
      mockCreate.mockRejectedValue(error)

      const result = await engine.generateNewsReport('hotspots', [
        {
          id: 1,
          title: '热点新闻',
          source: 'Bing',
          summary: '摘要内容',
          hotness: 80,
          aiAnalysis: '',
        },
      ])

      expect(result.summary).toBe('AI 额度已用尽，当前先展示基础结果。请补充模型额度后再生成综合报告。')
    })

    it('结构化输出不支持时应回退到带 json 提示的 json_object 模式', async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('response_format json_schema not supported'))
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '{"headline":"热点探索综合报告","summary":"已生成","keyFindings":["发现"],"riskAlerts":[],"recommendedActions":["继续观察"]}',
            },
          }],
        })

      const result = await engine.generateNewsReport('hotspots', [
        {
          id: 1,
          title: '热点新闻',
          source: 'Bing',
          summary: '摘要内容',
          hotness: 66,
          aiAnalysis: '',
        },
      ])

      expect(result.headline).toBe('热点探索综合报告')
      expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
        response_format: { type: 'json_object' },
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringMatching(/json/i) }),
        ]),
      }))
    })
  })
})
