import { OpenAI } from 'openai'
import { getConfig } from '../utils/config.js'

type TestResult = {
  name: string
  success: boolean
  detail: string
  required?: boolean
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '(empty)'
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***`
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`
}

function extractError(error: any): string {
  const status = error?.status || error?.response?.status || 'unknown'
  const code = error?.code || error?.error?.code || 'unknown'
  const message = error?.message || error?.response?.data?.error?.message || 'unknown error'
  return `status=${status}, code=${code}, message=${message}`
}

async function runTest(
  name: string,
  action: () => Promise<string>,
  required = true
): Promise<TestResult> {
  try {
    const detail = await action()
    return { name, success: true, detail, required }
  } catch (error: any) {
    return { name, success: false, detail: extractError(error), required }
  }
}

async function runStructuredWithFallback(client: OpenAI, model: string): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 120,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'connectivity_probe',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['ok', 'message'],
            properties: {
              ok: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: '你是一个连通性测试助手。按 schema 返回结果。',
        },
        {
          role: 'user',
          content: '返回一个表示连通成功的结果。',
        },
      ],
    } as any)

    return `mode=json_schema, response=${response.choices[0]?.message?.content || '(empty)'}`
  } catch {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是一个连通性测试助手。请严格返回 json 对象，不要输出额外说明。',
        },
        {
          role: 'user',
          content: '请返回 {"ok":true,"message":"pong"} 这种 json。',
        },
      ],
    } as any)

    return `mode=json_object_fallback, response=${response.choices[0]?.message?.content || '(empty)'}`
  }
}

async function main() {
  const config = getConfig()
  const client = new OpenAI({
    apiKey: config.ai.apiKey,
    baseURL: config.ai.apiUrl,
    timeout: config.ai.timeout,
  })

  console.log('=== AI 连通性测试 ===')
  console.log(`provider: ${config.ai.provider}`)
  console.log(`baseURL : ${config.ai.apiUrl}`)
  console.log(`model   : ${config.ai.model}`)
  console.log(`apiKey  : ${maskApiKey(config.ai.apiKey)}`)
  console.log('')

  const tests: TestResult[] = []
  const provider = String(config.ai.provider || '').toLowerCase()
  const providerPrefersJsonObject = ['bailian', 'dashscope'].includes(provider)
  const providerAllowsJsonObjectProbeFailure = ['lmstudio'].includes(provider)

  tests.push(await runTest('plain-chat', async () => {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'system', content: '你是一个测试助手。请只回复 pong。' },
        { role: 'user', content: 'ping' },
      ],
    })

    const content = response.choices[0]?.message?.content || '(empty)'
    return `response=${content}`
  }))

  tests.push(await runTest('json-object', async () => {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      temperature: 0,
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是一个连通性测试助手。请严格返回 json 对象，不要输出额外说明。',
        },
        {
          role: 'user',
          content: '请返回 {"ok":true,"message":"pong"} 这种 json。',
        },
      ],
    } as any)

    const content = response.choices[0]?.message?.content || '(empty)'
    return `response=${content}`
  }, !providerAllowsJsonObjectProbeFailure))

  tests.push(await runTest('json-schema', async () => {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      temperature: 0,
      max_tokens: 120,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'connectivity_probe',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['ok', 'message'],
            properties: {
              ok: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: '你是一个连通性测试助手。按 schema 返回结果。',
        },
        {
          role: 'user',
          content: '返回一个表示连通成功的结果。',
        },
      ],
    } as any)

    const content = response.choices[0]?.message?.content || '(empty)'
    return `response=${content}`
  }, !providerPrefersJsonObject))

  tests.push(await runTest('structured-with-fallback', async () => {
    return await runStructuredWithFallback(client, config.ai.model)
  }))

  console.log('=== 测试结果 ===')
  for (const test of tests) {
    console.log(`${test.success ? 'PASS' : 'FAIL'} ${test.name}`)
    console.log(`  ${test.detail}`)
  }

  const failed = tests.filter((item) => !item.success && item.required !== false)
  const optionalFailed = tests.filter((item) => !item.success && item.required === false)
  console.log('')
  if (optionalFailed.length > 0) {
    console.log('以下失败项仅用于能力探测，不影响当前后端兼容模式使用:')
    for (const item of optionalFailed) {
      console.log(`- ${item.name}: ${item.detail}`)
    }
    console.log('')
  }

  if (failed.length === 0) {
    console.log('全部测试通过。当前 AI 基础连通性正常。')
    process.exit(0)
  }

  console.log(`共有 ${failed.length} 项失败。优先看第一条失败项即可定位问题。`)
  process.exit(1)
}

main().catch((error) => {
  console.error('脚本执行失败:')
  console.error(extractError(error))
  process.exit(1)
})