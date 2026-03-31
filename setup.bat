@echo off
REM AI热点新闻监控系统 - Windows快速启动脚本

echo 🚀 AI热点新闻监控系统 - 快速启动
echo ==================================
echo.

REM 检查Node.js版本
echo ✅ 检查环境...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js未安装，请先安装Node.js 18+
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✓ Node.js版本: %NODE_VERSION%

REM 创建数据目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM 检查及复制配置文件
if not exist "config\config.json" (
    echo.
    echo ⚠️  未找到config/config.json
    echo ✓ 从config.example.json复制配置文件...
    copy config\config.example.json config\config.json
    echo.
    echo ⚠️  请编辑 config\config.json，填写OpenAI API Key等配置项
    echo ⚠️  然后重新运行本脚本
    exit /b 1
)

echo ✓ 配置文件已就位

REM 安装依赖
echo.
echo 📦 安装依赖...

cd frontend
if not exist "node_modules" (
    echo   → 前端依赖...
    call npm install
)
echo   ✓ 前端依赖完成

cd ..\backend
if not exist "node_modules" (
    echo   → 后端依赖...
    call npm install
)
echo   ✓ 后端依赖完成

cd ..

echo.
echo 🎯 启动服务...
echo.
echo 后端服务即将在 http://localhost:3001 启动
echo 前端应用即将在 http://localhost:3000 启动
echo.
echo ✓ 请在两个终端中分别运行：
echo   终端1 (后端):  cd backend ^&^& npm run dev
echo   终端2 (前端):  cd frontend ^&^& npm run dev
echo.

echo.
echo 🎉 准备完成！
echo 📖 更多信息：请参考 README.md 和 DEVELOPMENT_PLAN.md
pause
