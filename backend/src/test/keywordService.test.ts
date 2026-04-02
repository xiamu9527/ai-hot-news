import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestDb, closeTestDb, mockDatabase, mockLogger } from './setup.js'

// Mocks 必须在 import 被测模块之前注册
mockLogger()
mockDatabase()

// 动态导入被测模块（这样 mock 会生效）
const { getAllKeywords, getActiveKeywords, createKeyword, deleteKeyword, toggleKeyword, getKeywordById, updateLastChecked } =
  await import('../services/keywordService.js')

describe('keywordService', () => {
  beforeEach(() => {
    const db = createTestDb()
    // 每次测试前清空
    db.exec('DELETE FROM keyword_matches; DELETE FROM keywords;')
  })

  afterAll(() => closeTestDb())

  it('createKeyword - 应成功创建关键词', () => {
    const kw = createKeyword('AI', 'tech')
    expect(kw).toBeDefined()
    expect(kw.keyword).toBe('AI')
    expect(kw.scope).toBe('tech')
    expect(kw.active).toBe(1)
  })

  it('createKeyword - 重复关键词应抛出错误', () => {
    createKeyword('AI')
    expect(() => createKeyword('AI')).toThrow('已存在')
  })

  it('getAllKeywords - 应返回全部关键词', () => {
    createKeyword('React')
    createKeyword('Vue')
    const all = getAllKeywords()
    expect(all).toHaveLength(2)
  })

  it('getActiveKeywords - 应只返回活跃的关键词', () => {
    const kw = createKeyword('React')
    createKeyword('Vue')
    toggleKeyword(kw.id, false)
    const active = getActiveKeywords()
    expect(active).toHaveLength(1)
    expect(active[0].keyword).toBe('Vue')
  })

  it('deleteKeyword - 应成功删除', () => {
    const kw = createKeyword('React')
    expect(deleteKeyword(kw.id)).toBe(true)
    expect(getKeywordById(kw.id)).toBeUndefined()
  })

  it('deleteKeyword - 删除不存在的关键词应返回 false', () => {
    expect(deleteKeyword(9999)).toBe(false)
  })

  it('toggleKeyword - 应切换活跃状态', () => {
    const kw = createKeyword('React')
    const toggled = toggleKeyword(kw.id, false)
    expect(toggled?.active).toBe(0)
    const toggledBack = toggleKeyword(kw.id, true)
    expect(toggledBack?.active).toBe(1)
  })

  it('updateLastChecked - 应更新 lastCheckedAt', () => {
    const kw = createKeyword('React')
    expect(kw.lastCheckedAt).toBeNull()
    updateLastChecked(kw.id)
    const updated = getKeywordById(kw.id)
    expect(updated?.lastCheckedAt).not.toBeNull()
  })
})
