import { useState } from 'react'

export default function App() {
  const [activeTab, setActiveTab] = useState<'news' | 'monitor' | 'settings'>('news')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">🔥</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">AI热点监控</h1>
                <p className="text-xs text-slate-400">实时热点发现引擎</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400 text-sm">
                ● 在线
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 flex gap-8">
          <button
            onClick={() => setActiveTab('news')}
            className={`py-4 px-2 border-b-2 transition-all font-medium ${
              activeTab === 'news'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            📰 热点新闻
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`py-4 px-2 border-b-2 transition-all font-medium ${
              activeTab === 'monitor'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            👁️ 关键词监控
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-4 px-2 border-b-2 transition-all font-medium ${
              activeTab === 'settings'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            ⚙️ 设置
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'news' && <NewsTab />}
        {activeTab === 'monitor' && <MonitorTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}

function NewsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">热点新闻</h2>
        <select className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100">
          <option>所有来源</option>
          <option>Twitter</option>
          <option>HackerNews</option>
          <option>微博</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card-hover space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs bg-cyan-500/20 border border-cyan-500/30 rounded px-2 py-1 text-cyan-400">
                Twitter
              </span>
              <span className="text-xs text-slate-500">刚刚</span>
            </div>
            <h3 className="font-semibold text-slate-100 line-clamp-2">GPT-5即将发布，性能提升10倍</h3>
            <p className="text-sm text-slate-400 line-clamp-3">
              最新消息显示，OpenAI正在开发GPT-5，预计性能相比GPT-4将提升10倍以上...
            </p>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">热度: {100 + i * 50}</span>
              <button className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm">
                查看详情
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MonitorTab() {
  const [keywords, setKeywords] = useState<string[]>(['AI编程', 'GPT'])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">关键词监控</h2>
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              添加监控关键词
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入要监控的关键词（回车添加）"
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500"
              />
              <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded font-medium transition-colors">
                添加
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {keywords.map((keyword, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-800/50 rounded p-3 border border-slate-700"
              >
                <div>
                  <p className="font-medium">{keyword}</p>
                  <p className="text-xs text-slate-500">正在监控中...</p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">删除</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">设置</h2>
      <div className="space-y-4">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">数据源设置</h3>
          <div className="space-y-3">
            {['Twitter', 'HackerNews', 'Bing', 'Google', '微博', 'B站'].map((source) => (
              <label key={source} className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="w-4 h-4" />
                <span className="text-slate-300">{source}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4">通知设置</h3>
          <label className="flex items-center gap-3">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span className="text-slate-300">启用Web推送通知</span>
          </label>
        </div>
      </div>
    </div>
  )
}
