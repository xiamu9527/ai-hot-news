import schedule from 'node-schedule'
import { getConfig } from '../utils/config.js'
import { logger } from '../utils/logger.js'
import { getActiveKeywords, updateLastChecked } from './keywordService.js'
import { upsertNews, recordKeywordMatch, getNewsById } from './newsService.js'
import { createNotification, broadcastSSE } from './notificationService.js'
import { crawler } from '../datasources/crawler.js'
import { aiEngine } from '../ai/engine.js'

let keywordJob: schedule.Job | null = null
let hotspotJob: schedule.Job | null = null
let isRunningKeyword = false
let isRunningHotspot = false

const HOTSPOT_BATCH_SIZE = 12
const HOTSPOT_DEEP_ANALYSIS_COUNT = 8
const KEYWORD_BATCH_SIZE = 12
const KEYWORD_DEEP_ANALYSIS_COUNT = 6
const KEYWORD_NOTIFY_SCORE_THRESHOLD = 55

/** 判断新闻入库时间是否在最近 N 天内（超过此时间的历史数据不再参与 AI 验证） */
const AI_ANALYSIS_MAX_AGE_DAYS = 7
function isRecentNews(createdAt: string | undefined): boolean {
  if (!createdAt) return true
  const threshold = Date.now() - AI_ANALYSIS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const created = new Date(createdAt + (createdAt.includes('Z') || createdAt.includes('+') ? '' : 'Z')).getTime()
  return !Number.isNaN(created) && created >= threshold
}

/** 判断新闻发布日期是否为今天（只采集当天的新闻） */
function isTodayNews(publishedAt: string | undefined): boolean {
  if (!publishedAt) return true // 没有发布时间的默认保留
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const pubDate = new Date(publishedAt + (publishedAt.includes('Z') || publishedAt.includes('+') ? '' : 'Z'))
  if (Number.isNaN(pubDate.getTime())) return true // 解析失败的默认保留
  const pubStr = `${pubDate.getFullYear()}-${String(pubDate.getMonth() + 1).padStart(2, '0')}-${String(pubDate.getDate()).padStart(2, '0')}`
  return pubStr === todayStr
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildCompactSummary(content?: string): string {
  const normalized = (content || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const sentences = normalized
    .split(/(?<=[。！？.!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (sentences.length === 0) return normalized.slice(0, 220)

  let summary = ''
  for (const sentence of sentences) {
    if ((summary + sentence).length > 220) break
    summary += sentence
    if (summary.length >= 140) break
  }

  return (summary || normalized.slice(0, 220)).slice(0, 220)
}

function blendHotness(batchScore: number, detailScore: number): number {
  if (batchScore <= 0) return detailScore
  if (detailScore <= 0) return batchScore
  return Math.round(batchScore * 0.6 + detailScore * 0.4)
}

function emitAiProgress(params: {
  pipeline: 'hotspots' | 'keywords'
  stage: 'started' | 'seeded' | 'batch' | 'detail' | 'completed'
  current: number
  total: number
  message: string
  keyword?: string
}) {
  broadcastSSE('ai_progress', {
    ...params,
    timestamp: new Date().toISOString(),
  })
}

export function startScheduler() {
  const config = getConfig()

  // 检查调度器开关
  if (!config.scheduler?.enabled) {
    logger.info('Scheduler is disabled in config. Skipping automatic collection.')
    return
  }

  const intervalHours = config.scheduler?.intervalHours || 6
  const cronExpr = `0 */${intervalHours} * * *`

  // 关键词监控任务 - 每5分钟
  keywordJob = schedule.scheduleJob('*/5 * * * *', async () => {
    if (isRunningKeyword) return
    isRunningKeyword = true
    try {
      await runKeywordMonitor()
    } catch (err) {
      logger.error('Keyword monitor error:', err)
    } finally {
      isRunningKeyword = false
    }
  })

  // 热点采集任务 - 按配置间隔（默认每6小时）
  hotspotJob = schedule.scheduleJob(cronExpr, async () => {
    if (isRunningHotspot) return
    isRunningHotspot = true
    try {
      await runHotspotCollector()
    } catch (err) {
      logger.error('Hotspot collector error:', err)
    } finally {
      isRunningHotspot = false
    }
  })

  logger.info(`Scheduler started: keyword monitor (5min), hotspot collector (every ${intervalHours}h)`)
}

export function stopScheduler() {
  if (keywordJob) {
    keywordJob.cancel()
    keywordJob = null
  }
  if (hotspotJob) {
    hotspotJob.cancel()
    hotspotJob = null
  }
  logger.info('Scheduler stopped')
}

// 手动触发一次完整采集（遵守并发锁）
export async function triggerCollection() {
  logger.info('Manual collection triggered')
  const tasks: Promise<void>[] = []

  if (!isRunningHotspot) {
    isRunningHotspot = true
    tasks.push(
      runHotspotCollector()
        .catch(err => { logger.error('Manual hotspot collection error:', err) })
        .finally(() => { isRunningHotspot = false })
    )
  } else {
    logger.warn('Hotspot collection already running, skipping')
  }

  if (!isRunningKeyword) {
    isRunningKeyword = true
    tasks.push(
      runKeywordMonitor()
        .catch(err => { logger.error('Manual keyword monitor error:', err) })
        .finally(() => { isRunningKeyword = false })
    )
  } else {
    logger.warn('Keyword monitor already running, skipping')
  }

  await Promise.allSettled(tasks)
}

async function runKeywordMonitor() {
  const keywords = getActiveKeywords()
  if (keywords.length === 0) return

  logger.info(`Monitoring ${keywords.length} keywords...`)

  for (const kw of keywords) {
    try {
      emitAiProgress({
        pipeline: 'keywords',
        stage: 'started',
        current: 0,
        total: 0,
        keyword: kw.keyword,
        message: `开始处理关键词“${kw.keyword}”`,
      })

      // 通过 AI 引擎进行语义扩展
      let variants = [kw.keyword]
      try {
        variants = await aiEngine.expandKeyword(kw.keyword)
        logger.info(`Keyword "${kw.keyword}" expanded to: ${variants.join(', ')}`)
      } catch (err) {
        logger.warn(`Failed to expand keyword "${kw.keyword}", using original.`)
      }

      // 针对扩展出来的每个变体并行进行爬取搜索，并合并去重
      const allResultsP: Promise<any[]>[] = variants.map(v => crawler.searchKeyword(v))
      const nestedResults = await Promise.allSettled(allResultsP)
      
      const combinedResults = new Map() // 用 URL 作为主键去重
      for (const res of nestedResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          for (const item of res.value) {
            if (!combinedResults.has(item.url)) {
              combinedResults.set(item.url, item)
            }
          }
        }
      }
      
      const results = Array.from(combinedResults.values()).filter((item: any) => isTodayNews(item.publishedAt))
      logger.info(`Found ${combinedResults.size} total unique results for keyword "${kw.keyword}" variants, ${results.length} from today`)

      const keywordCandidates = results.map((item, index) => ({
        batchId: `${kw.id}:${index}`,
        item,
        compactSummary: buildCompactSummary(item.content),
      }))

      const keywordBatchChunks = chunkArray(
        keywordCandidates.map(({ batchId, item, compactSummary }) => ({
          id: batchId,
          title: item.title,
          source: item.source,
          summary: compactSummary || item.title,
          publishedAt: item.publishedAt ?? null,
        })),
        KEYWORD_BATCH_SIZE
      )

      const keywordBatchResults = (
        await Promise.all(keywordBatchChunks.map((chunk) => aiEngine.analyzeNewsBatch(`关键词命中:${kw.keyword}`, chunk)))
      ).flat()

      emitAiProgress({
        pipeline: 'keywords',
        stage: 'batch',
        current: keywordBatchResults.length,
        total: keywordCandidates.length,
        keyword: kw.keyword,
        message: `关键词“${kw.keyword}”已完成批量初筛 ${keywordBatchResults.length}/${keywordCandidates.length}`,
      })

      const keywordBatchMap = new Map(keywordBatchResults.map((item) => [item.id, item]))
      const deepAnalyzeIds = new Set(
        [...keywordBatchResults]
          .sort((left, right) => right.score - left.score)
          .slice(0, KEYWORD_DEEP_ANALYSIS_COUNT)
          .map((item) => item.id)
      )
      let keywordDetailedProcessed = 0

      for (const { batchId, item, compactSummary } of keywordCandidates) {
        // AI 验证内容真实性
        let verified: boolean | null = null
        let confidence = 0
        let warnings: string[] = []
        let hotness = keywordBatchMap.get(batchId)?.score || 30
        let aiAnalysis: Record<string, unknown> = {}
        let summary = compactSummary || item.content?.slice(0, 200) || ''
        const batchResult = keywordBatchMap.get(batchId)

        // 检查该条目是否为近期数据——历史数据不再参与 AI 深度分析
        const shouldDeepAnalyze = deepAnalyzeIds.has(batchId) && isRecentNews(item.publishedAt || undefined)

        aiAnalysis = {
          score: batchResult?.score || 30,
          category: batchResult?.category || '关键词命中',
          reasoning: batchResult?.reasoning || 'AI批量分析不可用',
          importance: batchResult?.importance || 'medium',
          isHotness: batchResult?.isHotness || false,
          riskFlag: batchResult?.riskFlag || false,
          analysisStage: 'batch',
        }

        if (shouldDeepAnalyze) {
          try {
            const [verifyResult, hotnessResult, summaryResult] = await Promise.all([
              aiEngine.verifyContent(item.title, item.content || '', item.source),
              aiEngine.detectHotness(item.title, item.content || ''),
              aiEngine.summarizeNews(item.title, item.content || ''),
            ])
            verified = verifyResult.verified
            confidence = verifyResult.confidence
            warnings = verifyResult.warnings
            hotness = blendHotness(batchResult?.score || 0, hotnessResult.score)
            item.title = summaryResult.title || item.title
            summary = summaryResult.summary || summary
            aiAnalysis = {
              score: hotness,
              category: batchResult?.category || '关键词命中',
              reasoning: hotnessResult.reasoning || batchResult?.reasoning || '',
              importance: batchResult?.importance || 'medium',
              isHotness: hotnessResult.isHotness,
              riskFlag: batchResult?.riskFlag || false,
              batchReasoning: batchResult?.reasoning || '',
              detailReasoning: hotnessResult.reasoning,
              analysisStage: 'detailed',
            }
            keywordDetailedProcessed += 1
            emitAiProgress({
              pipeline: 'keywords',
              stage: 'detail',
              current: keywordDetailedProcessed,
              total: deepAnalyzeIds.size,
              keyword: kw.keyword,
              message: `关键词“${kw.keyword}”详细分析 ${keywordDetailedProcessed}/${deepAnalyzeIds.size}`,
            })
          } catch {
            logger.warn('Keyword detailed analysis unavailable, using batch result')
          }
        }

        // 保存新闻
        const news = upsertNews({
          title: item.title,
          summary,
          content: item.content || '',
          url: item.url,
          source: item.source,
          hotness,
          verified,
          verifyConfidence: confidence,
          verifyWarnings: warnings,
          aiAnalysis,
          publishedAt: item.publishedAt
        })

        // 记录关键词匹配
        const matched = recordKeywordMatch(kw.id, news.id)

        // 仅对通过批量初筛的内容发通知，避免低质量命中过度打扰
        if (matched && hotness >= KEYWORD_NOTIFY_SCORE_THRESHOLD && !batchResult?.riskFlag && (verified === true || verified === null)) {
          createNotification({
            type: 'keyword_match',
            title: `🔔 关键词命中: "${kw.keyword}"`,
            message: item.title,
            data: { keywordId: kw.id, newsId: news.id, source: item.source, hotness }
          })
        }
      }

      updateLastChecked(kw.id)
      emitAiProgress({
        pipeline: 'keywords',
        stage: 'completed',
        current: deepAnalyzeIds.size,
        total: deepAnalyzeIds.size,
        keyword: kw.keyword,
        message: `关键词“${kw.keyword}”处理完成`,
      })
    } catch (err) {
      logger.error(`Error monitoring keyword "${kw.keyword}":`, err)
    }
  }
}

async function runHotspotCollector() {
  logger.info('Collecting hotspots...')

  try {
    emitAiProgress({
      pipeline: 'hotspots',
      stage: 'started',
      current: 0,
      total: 0,
      message: '开始采集并分析热点',
    })

    // 从多个源采集热点
    const rawItems = await crawler.collectHotspots()
    // 只保留当天的新闻
    const allItems = rawItems.filter((item: any) => isTodayNews(item.publishedAt))
    logger.info(`Collected ${rawItems.length} items, filtered to ${allItems.length} today's items`)

    // 第一步：先全部入库（无AI分析，确保数据不丢失）
    const savedItems: Array<{ item: any; newsId: number; compactSummary: string }> = []

    // 取消全局截断，保留各个数据源的独立配置返回额度
    // 采用随机洗牌的方法让不同数据源公平合并并全量入库
    for (let i = allItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allItems[i], allItems[j]] = [allItems[j], allItems[i]]
    }

    for (const item of allItems) {
      const compactSummary = buildCompactSummary(item.content)
      const news = upsertNews({
        title: item.title,
        summary: compactSummary,
        content: item.content || '',
        url: item.url,
        source: item.source,
        hotness: 20, // 默认热度
        publishedAt: item.publishedAt
      })
      savedItems.push({ item, newsId: news.id, compactSummary })
    }
    logger.info(`Saved ${savedItems.length} items to database`)
    emitAiProgress({
      pipeline: 'hotspots',
      stage: 'seeded',
      current: savedItems.length,
      total: savedItems.length,
      message: `已入库 ${savedItems.length} 条热点，准备进行 AI 初筛`,
    })

    // 广播热点更新事件
    broadcastSSE('hotspot_update', { timestamp: new Date().toISOString(), count: savedItems.length })

    // 第二步：批量 AI 分析压缩摘要，先做统一初筛和排序
    // 仅对最近一周内入库的新闻参与 AI 分析，历史数据不再重复消耗 AI 资源
    const recentSavedItems = savedItems.filter(({ newsId }) => {
      const record = getNewsById(newsId)
      return record ? isRecentNews(record.createdAt) : true
    })
    logger.info(`Filtered to ${recentSavedItems.length} recent items for AI analysis (skipped ${savedItems.length - recentSavedItems.length} old items)`)

    const batchCandidates = recentSavedItems.map(({ item, newsId, compactSummary }) => ({
      id: String(newsId),
      title: item.title,
      source: item.source,
      summary: compactSummary || item.title,
      publishedAt: item.publishedAt ?? null,
    }))

    const batchChunks = chunkArray(batchCandidates, HOTSPOT_BATCH_SIZE)
    const batchResults = (
      await Promise.all(batchChunks.map((chunk) => aiEngine.analyzeNewsBatch('综合热点', chunk)))
    ).flat()

    // 用批量结果更新数据库
    const { getDb } = await import('../models/database.js')
    const db = getDb()
    const batchResultMap = new Map(batchResults.map((item) => [Number(item.id), item]))

    if (batchResults.length > 0) {
      const batchUpdate = db.prepare('UPDATE news SET hotness = ?, aiAnalysis = ? WHERE id = ?')
      for (const { newsId } of savedItems) {
        const matched = batchResultMap.get(newsId)
        if (!matched) continue
        batchUpdate.run(
          matched.score,
          JSON.stringify({
            score: matched.score,
            category: matched.category,
            reasoning: matched.reasoning,
            importance: matched.importance,
            isHotness: matched.isHotness,
            riskFlag: matched.riskFlag,
            analysisStage: 'batch',
          }),
          newsId
        )
      }
      logger.info(`AI batch scored ${batchResults.length} items`)
      emitAiProgress({
        pipeline: 'hotspots',
        stage: 'batch',
        current: batchResults.length,
        total: savedItems.length,
        message: `热点批量初筛完成 ${batchResults.length}/${savedItems.length}`,
      })
    }

    // 第三步：对批量高分的候选热点做深分析（仅限最近的新闻）
    const toAnalyze = [...recentSavedItems]
      .sort((left, right) => {
        const leftScore = batchResultMap.get(left.newsId)?.score || 0
        const rightScore = batchResultMap.get(right.newsId)?.score || 0
        return rightScore - leftScore
      })
      .slice(0, HOTSPOT_DEEP_ANALYSIS_COUNT)

    const detailedUpdate = db.prepare(`
      UPDATE news SET
        title = ?,
        summary = ?,
        hotness = ?,
        verified = ?,
        verifyConfidence = ?,
        verifyWarnings = ?,
        aiAnalysis = ?
      WHERE id = ?
    `)

    let detailedProcessed = 0

    await Promise.all(toAnalyze.map(async ({ item, newsId, compactSummary }) => {
      try {
        const batchResult = batchResultMap.get(newsId)
        const [verifyResult, hotnessResult, translated] = await Promise.all([
          aiEngine.verifyContent(item.title, item.content || '', item.source),
          aiEngine.detectHotness(item.title, item.content || ''),
          aiEngine.summarizeNews(item.title, item.content || ''),
        ])

        const finalTitle = translated.title || item.title
        const finalSummary = translated.summary || compactSummary || buildCompactSummary(item.content)
        const finalHotness = blendHotness(batchResult?.score || 0, hotnessResult.score)

        detailedUpdate.run(
          finalTitle,
          finalSummary,
          finalHotness,
          verifyResult.verified === null ? null : (verifyResult.verified ? 1 : 0),
          verifyResult.confidence,
          JSON.stringify(verifyResult.warnings),
          JSON.stringify({
            score: finalHotness,
            category: batchResult?.category || '综合热点',
            reasoning: hotnessResult.reasoning || batchResult?.reasoning || '',
            importance: batchResult?.importance || 'medium',
            isHotness: hotnessResult.isHotness,
            riskFlag: batchResult?.riskFlag || false,
            batchReasoning: batchResult?.reasoning || '',
            detailReasoning: hotnessResult.reasoning,
            analysisStage: 'detailed',
          }),
          newsId
        )

        detailedProcessed += 1
        emitAiProgress({
          pipeline: 'hotspots',
          stage: 'detail',
          current: detailedProcessed,
          total: toAnalyze.length,
          message: `热点详细分析 ${detailedProcessed}/${toAnalyze.length}`,
        })

        logger.info(`AI detailed processed "${finalTitle.slice(0, 20)}..." -> Hotness: ${finalHotness}`)
      } catch (err) {
        logger.warn(`Failed to analyze news ${newsId}`)
      }
    }))

    emitAiProgress({
      pipeline: 'hotspots',
      stage: 'completed',
      current: toAnalyze.length,
      total: toAnalyze.length,
      message: '热点 AI 分析完成',
    })
  } catch (err) {
    logger.error('Hotspot collection error:', err)
  }
}
