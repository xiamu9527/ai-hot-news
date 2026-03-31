#!/bin/bash

# AI热点新闻监控系统 - 快速启动脚本

echo "🚀 AI热点新闻监控系统 - 快速启动"
echo "=================================="
echo ""

# 检查Node.js版本
echo "✅ 检查环境..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js版本: $NODE_VERSION"

# 创建数据目录
mkdir -p data logs

# 检查及复制配置文件
if [ ! -f "config/config.json" ]; then
    echo ""
    echo "⚠️  未找到config/config.json"
    echo "✓ 从config.example.json复制配置文件..."
    cp config/config.example.json config/config.json
    echo ""
    echo "⚠️  请编辑 config/config.json，填写OpenAI API Key等配置项"
    echo "⚠️  然后重新运行本脚本"
    exit 1
fi

echo "✓ 配置文件已就位"

# 安装依赖
echo ""
echo "📦 安装依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "  → 前端依赖..."
    npm install --silent
fi
echo "  ✓ 前端依赖完成"

cd ../backend
if [ ! -d "node_modules" ]; then
    echo "  → 后端依赖..."
    npm install --silent
fi
echo "  ✓ 后端依赖完成"

cd ..

# 启动服务
echo ""
echo "🎯 启动服务..."
echo ""
echo "后端服务即将在 http://localhost:3001 启动"
echo "前端应用即将在 http://localhost:3000 启动"
echo ""
echo "✓ 在两个终端中分别运行："
echo "  终端1 (后端):  cd backend && npm run dev"
echo "  终端2 (前端):  cd frontend && npm run dev"
echo ""
echo "或者用以下命令同时启动两个服务:"
echo ""

# 同时启动前后端（可选）
read -p "是否立即启动所有服务？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 使用tmux或screen同时启动多个终端（如果可用）
    # 这里简单起见，只输出说明
    echo "💡 Tip: 使用以下命令在单独终端启动:"
    echo ""
    echo "终端1: cd backend && npm run dev"
    echo "终端2: cd frontend && npm run dev"
fi

echo ""
echo "🎉 准备完成！"
echo "📖 更多信息：请参考 README.md 和 DEVELOPMENT_PLAN.md"
